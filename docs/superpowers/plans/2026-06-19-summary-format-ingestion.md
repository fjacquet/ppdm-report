# Summary-Format (Older PPDM) Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest older Live Optics PPDM `.xlsx` exports (pre-aggregated "summary" schema) and merge them into the estate alongside current "detail" exports, with honest provenance/coverage notes for metrics the summary format cannot supply.

**Architecture:** Approach B — `buildReportView` becomes format-aware (`detectFormat` → existing six engines for detail, new `summaryView` extractor for summary), both producing the same `ReportView`. The multi-server merge moves up from sheet/row level (`mergeWorkbooks`) to view level (`mergeViews(perServer)`). An additive `provenance` field on `ReportView` carries availability; the four detail-only metrics are explicitly "unavailable" for summary servers (never a silent 0).

**Tech Stack:** TypeScript, React 19, Vite, Vitest, SheetJS (`xlsx`), Zustand, i18next (en/de/fr/it), Biome.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-19-summary-format-ingestion-design.md`.
- **No silent caps (ADR 0004):** every unavailable/partial metric is surfaced (provenance + note); never block, never show a misleading 0.
- **Parity:** detail-format estate output must stay numerically identical to today, for every `ReportView` field **except** the new `provenance` field. Test-gated.
- **Typecheck both configs:** `npm run typecheck` runs `tsc --noEmit && tsc --noEmit -p tsconfig.test.json` — both must pass.
- **Lint:** `npm run lint` (Biome) clean.
- **Tests:** `npm run test:run` (Vitest) green.
- **i18n parity:** any new key must exist in **all four** locales (`en/de/fr/it`); `src/i18n/keyParity.test.ts` enforces this.
- **Font:** UI text uses `fontFamily: 'Arial, Helvetica, sans-serif'` (house rule).
- **No new dependencies.**
- **Date assumption:** summary `Details > Date` strings (`DD/MM/YYYY HH:mm:ss`, no TZ) are interpreted as **UTC**, consistent with `serialToIso`.

---

### Task 1: `detectFormat` — classify a parsed workbook

**Files:**
- Create: `src/engines/parser/detectFormat.ts`
- Test: `src/engines/parser/detectFormat.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook` from `src/types/ppdm.ts`; `normalizeWorkbook(buf: ArrayBuffer): ParsedWorkbook`.
- Produces: `export type WorkbookFormat = 'detail' | 'summary'`; `export function detectFormat(wb: ParsedWorkbook): WorkbookFormat`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeWorkbook } from './normalizeWorkbook'
import { detectFormat } from './detectFormat'

function load(path: string) {
  return normalizeWorkbook(new Uint8Array(readFileSync(path)).buffer)
}

describe('detectFormat', () => {
  it('classifies older summary exports as summary', () => {
    expect(detectFormat(load('ref/chuv-a1n01136i.xlsx'))).toBe('summary')
  })

  it('classifies current per-asset exports as detail', () => {
    expect(detectFormat(load('ref/PPDM.xlsx'))).toBe('detail')
  })

  it('treats an unrecognized workbook as detail', () => {
    const wb = { meta: {} as never, sheets: {}, inUse: [], idleAgents: [], warnings: [] }
    expect(detectFormat(wb)).toBe('detail')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/parser/detectFormat.test.ts`
Expected: FAIL — `detectFormat` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ParsedWorkbook } from '../../types/ppdm'

export type WorkbookFormat = 'detail' | 'summary'

/** Older summary exports carry a "System Configuration" sheet plus pre-aggregated
 *  "... Count And Cap" / "... Assets & Cap" sheets, and no per-asset rows. */
export function detectFormat(wb: ParsedWorkbook): WorkbookFormat {
  const names = Object.keys(wb.sheets)
  const hasSysConfig = names.includes('System Configuration')
  const hasCountCap = names.some((n) => /Count\s*(?:And|&)\s*Cap|Assets?\s*&\s*Cap/i.test(n))
  return hasSysConfig && hasCountCap ? 'summary' : 'detail'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/parser/detectFormat.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/detectFormat.ts src/engines/parser/detectFormat.test.ts
git commit -m "feat(parser): detectFormat distinguishes summary vs detail exports"
```

---

### Task 2: `captureMeta` tolerances — string dates + multi-disclaimer base-10

**Files:**
- Modify: `src/engines/parser/captureMeta.ts`
- Test: `src/engines/parser/captureMeta.test.ts` (add cases)

**Interfaces:**
- Consumes: `serialToIso(serial: number): string` (unchanged).
- Produces: `captureMeta(wb)` now parses `DD/MM/YYYY HH:mm:ss` strings to ISO-UTC and reads `baseTen` from **any** `Disclaimer` row.

**Context:** The summary `Details` sheet has two `Disclaimer` rows (only the first mentions Base 10) and a `Date` stored as the string `"18/02/2025 03:54:24"`, not an Excel serial. The current `Map` keeps only the last `Disclaimer` and passes the date string through verbatim.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { captureMeta } from './captureMeta'

function detailsWb(rows: (string | number)[][]) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Details')
  return wb
}

describe('captureMeta — summary tolerances', () => {
  it('parses DD/MM/YYYY HH:mm:ss dates as UTC ISO', () => {
    const meta = captureMeta(
      detailsWb([
        ['Project Name', 'chuv'],
        ['Date', '18/02/2025 03:54:24'],
      ]),
    )
    expect(meta.capturedAt).toBe('2025-02-18T03:54:24.000Z')
  })

  it('reads base-10 from any Disclaimer row, not just the last', () => {
    const meta = captureMeta(
      detailsWb([
        ['Project Name', 'chuv'],
        ['Disclaimer', 'All measurements ... reported using Base 10 units of Measurement.'],
        ['Disclaimer', 'Some Policy details would be missing for older PPDM versions.'],
      ]),
    )
    expect(meta.baseTen).toBe(true)
  })

  it('leaves unparseable dates as empty string', () => {
    const meta = captureMeta(detailsWb([['Date', 'not a date']]))
    expect(meta.capturedAt).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/parser/captureMeta.test.ts`
Expected: FAIL — `capturedAt` equals `"18/02/2025 03:54:24"` (not ISO); `baseTen` is `false`.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `captureMeta` (lines 15–38) and add a date helper:

```ts
/** Parse a "DD/MM/YYYY HH:mm:ss" string as UTC ISO-8601; '' when unparseable. */
function parseTextDate(s: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/.exec(s.trim())
  if (!m) return ''
  const [, dd, mm, yyyy, hh, mi, ss] = m
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss))
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** Read the key/value Details sheet into validated CaptureMeta. */
export function captureMeta(wb: XLSX.WorkBook): CaptureMeta {
  const ws = wb.Sheets.Details
  const kv = new Map<string, Cell>()
  const disclaimers: string[] = []
  if (ws) {
    const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as Cell[][]
    for (const row of aoa) {
      const key = String(row[0] ?? '').trim()
      if (!key) continue
      if (key === 'Disclaimer') disclaimers.push(String(row[1] ?? ''))
      else kv.set(key, row[1] ?? null)
    }
  }
  const date = kv.get('Date')
  return CaptureMetaSchema.parse({
    projectId: String(kv.get('Project ID') ?? ''),
    customer: String(kv.get('Project Name') ?? ''),
    collectorBuild: String(kv.get('Collector Build Version') ?? ''),
    capturedAt:
      typeof date === 'number' ? serialToIso(date) : parseTextDate(String(date ?? '')),
    baseTen: disclaimers.some((d) => /base\s*10/i.test(d)),
  })
}
```

- [ ] **Step 4: Run the full parser test suite to verify pass + no regression**

Run: `npx vitest run src/engines/parser/captureMeta.test.ts`
Expected: PASS (new cases + existing cases).

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/captureMeta.ts src/engines/parser/captureMeta.test.ts
git commit -m "feat(parser): captureMeta tolerates summary string dates + multi-disclaimer base-10"
```

---

### Task 3: `appVersion` fallback chain

**Files:**
- Modify: `src/engines/parser/deriveLabel.ts:19-21`
- Test: `src/engines/parser/deriveLabel.test.ts` (add cases)

**Interfaces:**
- Produces: `appVersion(wb)` resolves `PowerProtect Version → Power Protect Version → Product Version`, treating `N/A` as empty.

**Context:** Summary `System Information` has `Power Protect Version = N/A` (note the space) but `Product Version = 19.18.0-14`. The existing `field()` does **not** strip `N/A`, so a fallback must.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook } from '../../types/ppdm'
import { appVersion } from './deriveLabel'

function wbWithSysInfo(row: Record<string, string>): ParsedWorkbook {
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: {
      'System Information': { name: 'System Information', headers: Object.keys(row), rows: [row], capped: false },
    },
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('appVersion fallback', () => {
  it('prefers PowerProtect Version when present', () => {
    expect(appVersion(wbWithSysInfo({ 'PowerProtect Version': '19.19' }))).toBe('19.19')
  })

  it('falls back to Product Version when PowerProtect fields are N/A', () => {
    expect(
      appVersion(wbWithSysInfo({ 'Power Protect Version': 'N/A', 'Product Version': '19.18.0-14' })),
    ).toBe('19.18.0-14')
  })

  it('returns empty string when nothing usable is present', () => {
    expect(appVersion(wbWithSysInfo({ 'Power Protect Version': 'N/A' }))).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/parser/deriveLabel.test.ts`
Expected: FAIL — fallback returns `'N/A'` / `''` instead of `'19.18.0-14'`.

- [ ] **Step 3: Write minimal implementation**

Replace `appVersion` (lines 19–21):

```ts
/** A System Information field with 'N/A' normalized to empty. */
function ppdmField(wb: ParsedWorkbook, key: string): string {
  const v = field(wb, key)
  return v.toUpperCase() === 'N/A' ? '' : v
}

/** PPDM version from System Information; falls back through naming variants. '' when absent. */
export function appVersion(wb: ParsedWorkbook): string {
  return (
    ppdmField(wb, 'PowerProtect Version') ||
    ppdmField(wb, 'Power Protect Version') ||
    ppdmField(wb, 'Product Version')
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/parser/deriveLabel.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/deriveLabel.ts src/engines/parser/deriveLabel.test.ts
git commit -m "feat(parser): appVersion falls back to Product Version for older exports"
```

---

### Task 4: `Compliance` raw counts

**Files:**
- Modify: `src/types/reportView.ts:46-53`
- Modify: `src/engines/aggregation/compliance.ts:24-31`
- Test: `src/engines/aggregation/compliance.test.ts` (add assertions)

**Interfaces:**
- Produces: `Compliance` gains `appConsistentCount`, `immutableCount`, `replicatedCount` (the numerators behind the percentages — required so `mergeViews` combines exactly, not by multiplying rounded percentages).

- [ ] **Step 1: Write the failing test** — append to the existing describe block:

```ts
it('exposes raw numerators alongside percentages', () => {
  const wb = {
    meta: {} as never,
    sheets: {
      Copies: {
        name: 'Copies',
        headers: ['Data Consistency', 'Lock Status', 'Replica', 'Backup Level'],
        rows: [
          { 'Data Consistency': 'APPLICATION_CONSISTENT', 'Lock Status': 'GOVERNANCE', Replica: 'TRUE', 'Backup Level': 'FULL' },
          { 'Data Consistency': 'CRASH_CONSISTENT', 'Lock Status': 'ALL_COPIES_UNLOCKED', Replica: 'FALSE', 'Backup Level': 'FULL' },
        ],
        capped: false,
      },
    },
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
  const c = computeCompliance(wb)
  expect(c.appConsistentCount).toBe(1)
  expect(c.immutableCount).toBe(1)
  expect(c.replicatedCount).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/aggregation/compliance.test.ts`
Expected: FAIL — `appConsistentCount` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/types/reportView.ts`, extend the `Compliance` interface:

```ts
export interface Compliance {
  appConsistentPct: number
  immutablePct: number
  replicatedPct: number
  appConsistentCount: number
  immutableCount: number
  replicatedCount: number
  backupLevelMix: Record<string, number>
  windowSize: number
  capped: boolean
}
```

In `src/engines/aggregation/compliance.ts`, update the return:

```ts
  return {
    appConsistentPct: n > 0 ? appConsistent / n : 0,
    immutablePct: n > 0 ? immutable / n : 0,
    replicatedPct: n > 0 ? replicated / n : 0,
    appConsistentCount: appConsistent,
    immutableCount: immutable,
    replicatedCount: replicated,
    backupLevelMix,
    windowSize: n,
    capped: sheet?.capped ?? false,
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/aggregation/compliance.test.ts`
Expected: PASS. (Typecheck will still fail elsewhere until Task 5 supplies `provenance`; that is expected — do not fix it here.)

- [ ] **Step 5: Commit**

```bash
git add src/types/reportView.ts src/engines/aggregation/compliance.ts src/engines/aggregation/compliance.test.ts
git commit -m "feat(aggregation): compliance exposes raw numerators for exact merge"
```

---

### Task 5: Provenance types + builders + `buildReportView` detail wiring

**Files:**
- Modify: `src/types/reportView.ts` (add provenance types + field)
- Create: `src/engines/aggregation/provenance.ts`
- Modify: `src/engines/aggregation/coverage.ts` (export `emptyBand`, rename+export `finalizeBand`)
- Modify: `src/engines/aggregation/reportView.ts` (attach provenance on detail path)
- Test: `src/engines/aggregation/provenance.test.ts`, update `src/engines/aggregation/reportView.test.ts`

**Interfaces:**
- Produces:
  - `export type MetricKey = 'coverageByType' | 'gapsList' | 'compliance' | 'storageTargets'`
  - `export interface MetricProvenance { available: boolean; serversCovered: number; serversTotal: number; assetsCovered?: number; assetsTotal?: number }`
  - `ReportView.provenance: Record<MetricKey, MetricProvenance>`
  - `allAvailable(assetsTotal: number): Record<MetricKey, MetricProvenance>`
  - `allUnavailable(assetsTotal: number): Record<MetricKey, MetricProvenance>`
  - `emptyBand(): CoverageBand`, `finalizeBand(b: CoverageBand): CoverageBand` (exported from `coverage.ts`)

- [ ] **Step 1: Write the failing test** — `src/engines/aggregation/provenance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { allAvailable, allUnavailable } from './provenance'

describe('provenance builders', () => {
  it('allAvailable marks every detail metric available for one server', () => {
    const p = allAvailable(3886)
    expect(p.compliance).toEqual({
      available: true, serversCovered: 1, serversTotal: 1, assetsCovered: 3886, assetsTotal: 3886,
    })
    expect(p.gapsList.available).toBe(true)
  })

  it('allUnavailable marks every detail metric unavailable but records asset total', () => {
    const p = allUnavailable(1855)
    expect(p.compliance).toEqual({
      available: false, serversCovered: 0, serversTotal: 1, assetsCovered: 0, assetsTotal: 1855,
    })
    expect(p.storageTargets.available).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/aggregation/provenance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Add to `src/types/reportView.ts` (after the `CaptureMeta` import, before `ReportView`):

```ts
export type MetricKey = 'coverageByType' | 'gapsList' | 'compliance' | 'storageTargets'

/** Availability of a detail-only metric across the servers in scope. */
export interface MetricProvenance {
  available: boolean
  serversCovered: number
  serversTotal: number
  /** Asset-level coverage for the compliance metric only; omitted elsewhere. */
  assetsCovered?: number
  assetsTotal?: number
}
```

Add `provenance` to the `ReportView` interface (after `policies`):

```ts
  policies: Policies
  provenance: Record<MetricKey, MetricProvenance>
```

Create `src/engines/aggregation/provenance.ts`:

```ts
import type { MetricKey, MetricProvenance } from '../../types/reportView'

/** Provenance for a single detail-format server: every metric available. */
export function allAvailable(assetsTotal: number): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: true, serversCovered: 1, serversTotal: 1 },
    gapsList: { available: true, serversCovered: 1, serversTotal: 1 },
    compliance: { available: true, serversCovered: 1, serversTotal: 1, assetsCovered: assetsTotal, assetsTotal },
    storageTargets: { available: true, serversCovered: 1, serversTotal: 1 },
  }
}

/** Provenance for a single summary-format server: every detail-only metric unavailable. */
export function allUnavailable(assetsTotal: number): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: false, serversCovered: 0, serversTotal: 1 },
    gapsList: { available: false, serversCovered: 0, serversTotal: 1 },
    compliance: { available: false, serversCovered: 0, serversTotal: 1, assetsCovered: 0, assetsTotal },
    storageTargets: { available: false, serversCovered: 0, serversTotal: 1 },
  }
}
```

In `src/engines/aggregation/coverage.ts`, export the helpers (rename `finalize` → `finalizeBand`):

```ts
export function emptyBand(): CoverageBand {
  return { protected: 0, unprotected: 0, excluded: 0, pct: 0, pctInclExcluded: 0 }
}

export function finalizeBand(b: CoverageBand): CoverageBand {
  const denom = b.protected + b.unprotected
  const denomAll = denom + b.excluded
  return {
    ...b,
    pct: denom > 0 ? b.protected / denom : 0,
    pctInclExcluded: denomAll > 0 ? b.protected / denomAll : 0,
  }
}
```

Update the two internal call sites in `computeCoverage` (`emptyBand()` is unchanged; replace `finalize(` with `finalizeBand(`).

Update `src/engines/aggregation/reportView.ts`:

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { ReportView } from '../../types/reportView'
import { computeCapacity } from './capacity'
import { computeCompliance } from './compliance'
import { computeCoverage } from './coverage'
import { findGaps } from './gaps'
import { computeJobs } from './jobs'
import { summarizePolicies } from './policies'
import { allAvailable } from './provenance'

/** Single composition root: ParsedWorkbook → fully derived ReportView. Pure. */
export function buildReportView(wb: ParsedWorkbook): ReportView {
  const coverage = computeCoverage(wb)
  const totalAssets = coverage.overall.protected + coverage.overall.unprotected + coverage.overall.excluded
  return {
    meta: wb.meta,
    inUse: wb.inUse,
    idleAgents: wb.idleAgents,
    warnings: wb.warnings,
    coverage,
    gaps: findGaps(wb),
    jobs: computeJobs(wb),
    compliance: computeCompliance(wb),
    capacity: computeCapacity(wb),
    policies: summarizePolicies(wb),
    provenance: allAvailable(totalAssets),
  }
}
```

- [ ] **Step 4: Update the existing reportView test fixture**

In `src/engines/aggregation/reportView.test.ts`, any assertion comparing the whole `ReportView` object must now include `provenance`. Add `provenance: allAvailable(<expected total assets>)` to the expected object (import `allAvailable` from `./provenance`), or assert metric fields individually. Then run:

Run: `npx vitest run src/engines/aggregation/provenance.test.ts src/engines/aggregation/reportView.test.ts src/engines/aggregation/coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/reportView.ts src/engines/aggregation/provenance.ts src/engines/aggregation/provenance.test.ts src/engines/aggregation/coverage.ts src/engines/aggregation/reportView.ts src/engines/aggregation/reportView.test.ts
git commit -m "feat(aggregation): additive provenance model + detail-path wiring"
```

---

### Task 6: `summaryView` extractor

**Files:**
- Create: `src/engines/aggregation/summaryView.ts`
- Test: `src/engines/aggregation/summaryView.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook` (summary format, as produced by `normalizeWorkbook`); `cellStr`/`cellNum`/`countBy` from `./rows`; `emptyBand`/`finalizeBand` from `./coverage`; `allUnavailable` from `./provenance`; `AGENT_SHEETS` from `../../types/ppdm`.
- Produces: `export function summaryView(wb: ParsedWorkbook): ReportView`.

**Context:** In a summary `ParsedWorkbook`, key/value sheets (`System Configuration`, `... Count And Cap`) have headers `['Field','Value']`, so each row is `{ Field, Value }`. `Jobs Summary` and `Policies` have real column headers.

- [ ] **Step 1: Write the failing test** (real-file regression against `ref/chuv-a1n01136i.xlsx`):

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { summaryView } from './summaryView'

const wb = normalizeWorkbook(new Uint8Array(readFileSync('ref/chuv-a1n01136i.xlsx')).buffer)
const v = summaryView(wb)

describe('summaryView — chuv-a1n01136i', () => {
  it('recovers overall coverage counts from System Configuration', () => {
    expect(v.coverage.overall.protected).toBe(1782)
    expect(v.coverage.overall.unprotected).toBe(43)
    expect(v.coverage.overall.excluded).toBe(30) // 1855 - 1782 - 43
  })

  it('recovers unprotected count and total capacity for gaps, with no asset list', () => {
    expect(v.gaps.count).toBe(43)
    expect(v.gaps.totalCapacityGb).toBeCloseTo(10222.09, 1) // VM unprotected capacity; others 0
    expect(v.gaps.top.items).toEqual([])
    expect(v.gaps.top.total).toBe(43)
  })

  it('recovers job success totals from Jobs Summary', () => {
    // Successful: Config 8 + Delete 1632 + Discover 60 + Protect 1993 + Replicate 1930 + DR 318 = 5941
    expect(v.jobs.counts.SUCCESS).toBe(5941)
    expect(v.jobs.capped).toBe(false)
    expect(v.jobs.successPct).toBeGreaterThan(0.99)
  })

  it('recovers policies (purpose from Category) and DD mtree count', () => {
    expect(v.policies.count).toBeGreaterThan(0)
    expect(v.capacity.mtreeCount).toBe(97)
  })

  it('maps in-use asset types to canonical agent sheets', () => {
    expect(v.inUse).toContain('Virtual Machines')
    expect(v.inUse).toContain('File Systems')
  })

  it('marks the four detail-only metrics unavailable', () => {
    expect(v.provenance.compliance.available).toBe(false)
    expect(v.provenance.gapsList.available).toBe(false)
    expect(v.provenance.coverageByType.available).toBe(false)
    expect(v.provenance.storageTargets.available).toBe(false)
    expect(v.coverage.byType).toEqual({})
    expect(v.capacity.targets).toEqual([])
  })
})
```

> Note: `mtreeCount` expects `97` — confirm against the `Data Domain Mtrees` row count for this file during Step 2 and adjust the literal if the parsed count differs (the sheet dump showed 98 rows including the header; `rows` excludes the header → 97).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/aggregation/summaryView.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { AGENT_SHEETS, type ParsedWorkbook, type SheetData } from '../../types/ppdm'
import type { ReportView } from '../../types/reportView'
import { emptyBand, finalizeBand } from './coverage'
import { allUnavailable } from './provenance'
import { cellNum, cellStr, countBy } from './rows'

/** Summary "... Count And Cap" sheet → canonical AGENT_SHEETS name (null = no agent sheet). */
const COUNT_CAP: Array<{ sheet: string; agent: string | null }> = [
  { sheet: 'VMs Count And Cap', agent: 'Virtual Machines' },
  { sheet: 'SQL DBs Count & Cap', agent: 'SQL Databases' },
  { sheet: 'Oracle DBs Count & Cap', agent: 'Oracle Databases' },
  { sheet: 'FileSystem Assets Count & Cap', agent: 'File Systems' },
  { sheet: 'Kubernetes Assets & Cap', agent: 'Kubernetes' },
  { sheet: 'VMAX Assets & Cap', agent: null },
  { sheet: 'SAP Hana DBs Assets & Cap', agent: 'SAP HANA Databases' },
  { sheet: 'Exchange DBs Assets & Cap', agent: 'Microsoft Exchange Databases' },
  { sheet: 'NAS Assets & Cap', agent: 'NAS' },
]

/** First Value whose Field matches `pred` in a key/value sheet; 0 when absent. */
function fieldNum(sheet: SheetData | undefined, pred: (field: string) => boolean): number {
  if (!sheet) return 0
  for (const r of sheet.rows) if (pred(cellStr(r, 'Field'))) return cellNum(r, 'Value')
  return 0
}

/** Build a ReportView from an older summary-format workbook. Pure. */
export function summaryView(wb: ParsedWorkbook): ReportView {
  const sysCfg = wb.sheets['System Configuration']
  const protectedN = fieldNum(sysCfg, (f) => f === 'Number of Protected Assets')
  const unprotectedN = fieldNum(sysCfg, (f) => f === 'Number of UnProtected Assets')
  const assetsN = fieldNum(sysCfg, (f) => f === 'Assets Count')
  const excluded = Math.max(0, assetsN - protectedN - unprotectedN)
  const overall = finalizeBand({ ...emptyBand(), protected: protectedN, unprotected: unprotectedN, excluded })
  const totalAssets = protectedN + unprotectedN + excluded

  // gaps: count from System Configuration, capacity summed across per-type Count And Cap sheets.
  let unprotectedCapacityGb = 0
  for (const { sheet } of COUNT_CAP) {
    unprotectedCapacityGb += fieldNum(wb.sheets[sheet], (f) =>
      /Capacity Unprotected Assets \(GB\)/i.test(f),
    )
  }

  // jobs: sum the Jobs Summary columns into the detail vocabulary so merges line up.
  const jobRows = wb.sheets['Jobs Summary']?.rows ?? []
  const sumCol = (key: string) => jobRows.reduce((acc, r) => acc + cellNum(r, key), 0)
  const counts: Record<string, number> = {
    SUCCESS: sumCol('Successful Jobs'),
    FAILED: sumCol('Failed Jobs'),
    CANCELLED: sumCol('Cancelled'),
    OK_WITH_ERRORS: sumCol('Ok with Errors'),
    UNKNOWN: sumCol('Unknown'),
    SKIPPED: sumCol('Skipped'),
  }
  const jobsTotal = Object.values(counts).reduce((a, b) => a + b, 0)

  // policies: summary uses 'Category' where detail uses 'Purpose'.
  const policyRows = wb.sheets.Policies?.rows ?? []
  const perPolicy = policyRows.map((r) => ({
    name: cellStr(r, 'Name'),
    purpose: cellStr(r, 'Category'),
    assetCount: cellNum(r, 'Number of Assets'),
    protectionCapacityGb: cellNum(r, 'Total Asset Protection Capacity (GB)'),
  }))

  // inUse: per-type Asset Count > 0, mapped to canonical agent sheet names.
  const inUseSet = new Set<string>()
  for (const { sheet, agent } of COUNT_CAP) {
    if (!agent) continue
    if (fieldNum(wb.sheets[sheet], (f) => /Asset Count$/i.test(f)) > 0) inUseSet.add(agent)
  }

  return {
    meta: wb.meta,
    inUse: AGENT_SHEETS.filter((a) => inUseSet.has(a)),
    idleAgents: [],
    warnings: wb.warnings,
    coverage: { byType: {}, overall },
    gaps: {
      count: unprotectedN,
      totalCapacityGb: unprotectedCapacityGb,
      top: { items: [], total: unprotectedN, shown: 0 },
    },
    jobs: {
      counts,
      total: jobsTotal,
      successPct: jobsTotal > 0 ? counts.SUCCESS / jobsTotal : 0,
      capped: false,
      windowSize: jobsTotal,
    },
    compliance: {
      appConsistentPct: 0, immutablePct: 0, replicatedPct: 0,
      appConsistentCount: 0, immutableCount: 0, replicatedCount: 0,
      backupLevelMix: {}, windowSize: 0, capped: false,
    },
    capacity: { targets: [], flagged: [], mtreeCount: wb.sheets['Data Domain Mtrees']?.rows.length ?? 0 },
    policies: { count: policyRows.length, byPurpose: countBy(policyRows, 'Category'), perPolicy },
    provenance: allUnavailable(totalAssets),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/aggregation/summaryView.test.ts`
Expected: PASS (adjust `mtreeCount` literal in the test if Step 2 showed a different parsed count).

- [ ] **Step 5: Commit**

```bash
git add src/engines/aggregation/summaryView.ts src/engines/aggregation/summaryView.test.ts
git commit -m "feat(aggregation): summaryView extracts ReportView from older summary exports"
```

---

### Task 7: `buildReportView` format dispatch

**Files:**
- Modify: `src/engines/aggregation/reportView.ts`
- Test: `src/engines/aggregation/reportView.test.ts` (add a summary-format case)

**Interfaces:**
- Consumes: `detectFormat` (Task 1), `summaryView` (Task 6).
- Produces: `buildReportView(wb)` returns `summaryView(wb)` for summary workbooks, the detail path otherwise.

- [ ] **Step 1: Write the failing test** — add to `reportView.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'

it('dispatches summary-format workbooks to the summary extractor', () => {
  const wb = normalizeWorkbook(new Uint8Array(readFileSync('ref/chuv-a1n01136i.xlsx')).buffer)
  const view = buildReportView(wb)
  expect(view.coverage.overall.protected).toBe(1782)
  expect(view.provenance.compliance.available).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/aggregation/reportView.test.ts`
Expected: FAIL — detail path runs on the summary workbook, `protected` is `0`.

- [ ] **Step 3: Write minimal implementation**

Add the import and a dispatch guard at the top of `buildReportView`:

```ts
import { detectFormat } from '../parser/detectFormat'
import { summaryView } from './summaryView'
// ...
export function buildReportView(wb: ParsedWorkbook): ReportView {
  if (detectFormat(wb) === 'summary') return summaryView(wb)
  const coverage = computeCoverage(wb)
  // ...unchanged detail path...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/aggregation/reportView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/aggregation/reportView.ts src/engines/aggregation/reportView.test.ts
git commit -m "feat(aggregation): buildReportView dispatches on workbook format"
```

---

### Task 8: `foldMeta` + `mergeViews` + parity gate

**Files:**
- Create: `src/engines/parser/foldMeta.ts`
- Create: `src/engines/aggregation/mergeViews.ts`
- Modify: `src/engines/parser/mergeWorkbooks.ts` (use `foldMeta`)
- Test: `src/engines/aggregation/mergeViews.test.ts`, `src/engines/aggregation/mergeViews.parity.test.ts`

**Interfaces:**
- Consumes: `ReportView`, `MetricKey`, `MetricProvenance`; `emptyBand`/`finalizeBand` from `./coverage`; `topN` from `./topN`; `TOP_N_DEFAULT`/`AGENT_SHEETS` from `../../types/ppdm`.
- Produces:
  - `export function foldMeta(metas: CaptureMeta[]): CaptureMeta`
  - `export function mergeViews(views: ReportView[]): ReportView` (identity on a single view).

- [ ] **Step 1: Write the failing tests**

`src/engines/aggregation/mergeViews.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ReportView } from '../../types/reportView'
import { allAvailable, allUnavailable } from './provenance'
import { mergeViews } from './mergeViews'

function detail(over: Partial<ReportView>): ReportView {
  return {
    meta: { projectId: 'p', customer: 'ACME', collectorBuild: 'b', capturedAt: '2026-01-01', baseTen: true },
    inUse: [], idleAgents: [], warnings: [],
    coverage: { byType: {}, overall: { protected: 0, unprotected: 0, excluded: 0, pct: 0, pctInclExcluded: 0 } },
    gaps: { count: 0, totalCapacityGb: 0, top: { items: [], total: 0, shown: 0 } },
    jobs: { counts: {}, total: 0, successPct: 0, capped: false, windowSize: 0 },
    compliance: { appConsistentPct: 0, immutablePct: 0, replicatedPct: 0, appConsistentCount: 0, immutableCount: 0, replicatedCount: 0, backupLevelMix: {}, windowSize: 0, capped: false },
    capacity: { targets: [], flagged: [], mtreeCount: 0 },
    policies: { count: 0, byPurpose: {}, perPolicy: [] },
    provenance: allAvailable(0),
    ...over,
  }
}

describe('mergeViews', () => {
  it('returns the single view unchanged', () => {
    const v = detail({})
    expect(mergeViews([v])).toBe(v)
  })

  it('sums overall coverage counts and re-finalizes pct', () => {
    const a = detail({ coverage: { byType: {}, overall: { protected: 8, unprotected: 2, excluded: 0, pct: 0.8, pctInclExcluded: 0.8 } } })
    const b = detail({ coverage: { byType: {}, overall: { protected: 2, unprotected: 8, excluded: 0, pct: 0.2, pctInclExcluded: 0.2 } } })
    const m = mergeViews([a, b])
    expect(m.coverage.overall.protected).toBe(10)
    expect(m.coverage.overall.pct).toBeCloseTo(0.5)
  })

  it('combines compliance by raw counts, not rounded pct', () => {
    const a = detail({ compliance: { ...detail({}).compliance, immutableCount: 3, windowSize: 4, immutablePct: 0.75 } })
    const b = detail({ compliance: { ...detail({}).compliance, immutableCount: 1, windowSize: 6, immutablePct: 1 / 6 } })
    const m = mergeViews([a, b])
    expect(m.compliance.immutablePct).toBeCloseTo(4 / 10)
  })

  it('computes provenance coverage across mixed servers', () => {
    const d = detail({ provenance: allAvailable(370) })
    const s = detail({ provenance: allUnavailable(3516) })
    const m = mergeViews([d, s, s, s])
    expect(m.provenance.compliance).toMatchObject({ available: true, serversCovered: 1, serversTotal: 4, assetsCovered: 370, assetsTotal: 370 + 3516 * 3 })
  })
})
```

`src/engines/aggregation/mergeViews.parity.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { mergeWorkbooks } from '../parser/mergeWorkbooks'
import { buildReportView } from './reportView'
import { mergeViews } from './mergeViews'

/** Strip the new provenance field; the legacy path can't produce per-server denominators. */
function omitProvenance(v: ReturnType<typeof buildReportView>) {
  const { provenance: _p, warnings: _w, ...rest } = v
  return rest
}

describe('mergeViews parity with legacy sheet-level merge (detail estate)', () => {
  it('produces identical metrics for a two-server detail estate', () => {
    const wb = normalizeWorkbook(new Uint8Array(readFileSync('ref/PPDM.xlsx')).buffer)
    const servers = [
      { label: 'srv-a', workbook: wb },
      { label: 'srv-b', workbook: wb },
    ]
    const legacy = buildReportView(mergeWorkbooks(servers))
    const next = mergeViews(servers.map((s) => buildReportView(s.workbook)))
    expect(omitProvenance(next)).toEqual(omitProvenance(legacy))
  })
})
```

> `import type { ReportView } from '../../types/reportView'` is referenced implicitly via `buildReportView`; no extra import needed beyond what is shown.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engines/aggregation/mergeViews.test.ts src/engines/aggregation/mergeViews.parity.test.ts`
Expected: FAIL — `mergeViews` module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/engines/parser/foldMeta.ts`:

```ts
import type { CaptureMeta } from '../../types/ppdm'

/** Fold N capture metas into one estate meta (first identity, latest date, unanimous base). */
export function foldMeta(metas: CaptureMeta[]): CaptureMeta {
  const first = metas[0]
  const dates = metas.map((m) => m.capturedAt).filter(Boolean).sort()
  return {
    projectId: first.projectId,
    customer: first.customer,
    collectorBuild: first.collectorBuild,
    capturedAt: dates.at(-1) ?? '',
    baseTen: metas.every((m) => m.baseTen) ? true : metas.every((m) => !m.baseTen) ? false : first.baseTen,
  }
}
```

Refactor `src/engines/parser/mergeWorkbooks.ts` to use it — replace the inline `meta` block (lines 41–57) with:

```ts
  const meta = foldMeta(workbooks.map((w) => w.meta))
```

and add `import { foldMeta } from './foldMeta'` at the top.

Create `src/engines/aggregation/mergeViews.ts`:

```ts
import { AGENT_SHEETS, TOP_N_DEFAULT } from '../../types/ppdm'
import type { CoverageBand, MetricKey, MetricProvenance, ReportView } from '../../types/reportView'
import { foldMeta } from '../parser/foldMeta'
import { emptyBand, finalizeBand } from './coverage'
import { topN } from './topN'

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

function addBand(acc: CoverageBand, b: CoverageBand): CoverageBand {
  acc.protected += b.protected
  acc.unprotected += b.unprotected
  acc.excluded += b.excluded
  return acc
}

function mergeCounts(dicts: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of dicts) for (const [k, n] of Object.entries(d)) out[k] = (out[k] ?? 0) + n
  return out
}

function mergeProvenance(views: ReportView[]): Record<MetricKey, MetricProvenance> {
  const keys: MetricKey[] = ['coverageByType', 'gapsList', 'compliance', 'storageTargets']
  const out = {} as Record<MetricKey, MetricProvenance>
  for (const key of keys) {
    const ps = views.map((v) => v.provenance[key])
    const serversCovered = ps.filter((p) => p.available).length
    const mp: MetricProvenance = { available: serversCovered > 0, serversCovered, serversTotal: views.length }
    if (key === 'compliance') {
      mp.assetsCovered = sum(ps.map((p) => p.assetsCovered ?? 0))
      mp.assetsTotal = sum(ps.map((p) => p.assetsTotal ?? 0))
    }
    out[key] = mp
  }
  return out
}

/** Fold N per-server ReportViews into one estate ReportView. Pure. Identity on a single view. */
export function mergeViews(views: ReportView[]): ReportView {
  if (views.length === 0) throw new Error('mergeViews requires at least one view')
  if (views.length === 1) return views[0]

  // coverage
  const overall = views.reduce((acc, v) => addBand(acc, v.coverage.overall), emptyBand())
  const byType: Record<string, CoverageBand> = {}
  for (const v of views) {
    for (const [type, band] of Object.entries(v.coverage.byType)) {
      byType[type] = finalizeBand(addBand(byType[type] ?? emptyBand(), band))
    }
  }

  // jobs
  const jobCounts = mergeCounts(views.map((v) => v.jobs.counts))
  const jobsTotal = sum(views.map((v) => v.jobs.total))

  // compliance
  const appC = sum(views.map((v) => v.compliance.appConsistentCount))
  const imm = sum(views.map((v) => v.compliance.immutableCount))
  const rep = sum(views.map((v) => v.compliance.replicatedCount))
  const n = sum(views.map((v) => v.compliance.windowSize))

  // gaps (per-server top-N lists suffice for the global top-N)
  const gapItems = views.flatMap((v) => v.gaps.top.items)
  const gapTop = topN(gapItems, TOP_N_DEFAULT, (a) => a.sizeGb)
  const gapsCount = sum(views.map((v) => v.gaps.count))

  // capacity
  const targets = views.flatMap((v) => v.capacity.targets)

  return {
    meta: foldMeta(views.map((v) => v.meta)),
    inUse: AGENT_SHEETS.filter((a) => views.some((v) => v.inUse.includes(a))),
    idleAgents: AGENT_SHEETS.filter(
      (a) => !views.some((v) => v.inUse.includes(a)) && views.some((v) => v.idleAgents.includes(a)),
    ),
    warnings: [], // estate warnings are applied by the derivation layer (estateWarnings)
    coverage: { byType, overall: finalizeBand(overall) },
    gaps: { count: gapsCount, totalCapacityGb: sum(views.map((v) => v.gaps.totalCapacityGb)), top: { ...gapTop, total: gapsCount } },
    jobs: {
      counts: jobCounts,
      total: jobsTotal,
      successPct: jobsTotal > 0 ? (jobCounts.SUCCESS ?? 0) / jobsTotal : 0,
      capped: views.some((v) => v.jobs.capped),
      windowSize: jobsTotal,
    },
    compliance: {
      appConsistentPct: n > 0 ? appC / n : 0,
      immutablePct: n > 0 ? imm / n : 0,
      replicatedPct: n > 0 ? rep / n : 0,
      appConsistentCount: appC, immutableCount: imm, replicatedCount: rep,
      backupLevelMix: mergeCounts(views.map((v) => v.compliance.backupLevelMix)),
      windowSize: n,
      capped: views.some((v) => v.compliance.capped),
    },
    capacity: { targets, flagged: targets.filter((t) => t.flagged), mtreeCount: sum(views.map((v) => v.capacity.mtreeCount)) },
    policies: {
      count: sum(views.map((v) => v.policies.count)),
      byPurpose: mergeCounts(views.map((v) => v.policies.byPurpose)),
      perPolicy: views.flatMap((v) => v.policies.perPolicy),
    },
    provenance: mergeProvenance(views),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engines/aggregation/mergeViews.test.ts src/engines/aggregation/mergeViews.parity.test.ts src/engines/parser/mergeWorkbooks.test.ts`
Expected: PASS (mergeWorkbooks tests still green after the `foldMeta` refactor).

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/foldMeta.ts src/engines/aggregation/mergeViews.ts src/engines/aggregation/mergeViews.test.ts src/engines/aggregation/mergeViews.parity.test.ts src/engines/parser/mergeWorkbooks.ts
git commit -m "feat(aggregation): view-level mergeViews + foldMeta extraction + parity gate"
```

---

### Task 9: `estateWarnings` extraction + mixed-format umbrella

**Files:**
- Create: `src/engines/parser/estateWarnings.ts`
- Modify: `src/engines/parser/mergeWorkbooks.ts` (delegate to `estateWarnings`)
- Test: `src/engines/parser/estateWarnings.test.ts`

**Interfaces:**
- Consumes: `ServerWorkbook[]`; `appHostName` from `./deriveLabel`; `detectFormat` from `./detectFormat`; `LIVE_OPTICS_ROW_CAP` from `../../types/ppdm`.
- Produces: `export function estateWarnings(servers: ServerWorkbook[]): string[]` — single-source returns that workbook's warnings unchanged; multi-source returns attribution + unit-mismatch + duplicate + blended-window + (new) mixed-format umbrella.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, ServerWorkbook } from '../../types/ppdm'
import { estateWarnings } from './estateWarnings'

function wb(over: Partial<ParsedWorkbook> = {}): ParsedWorkbook {
  return {
    meta: { projectId: 'p', customer: 'ACME', collectorBuild: 'b', capturedAt: '2026-01-01', baseTen: true },
    sheets: {}, inUse: [], idleAgents: [], warnings: [], ...over,
  }
}
const srv = (label: string, workbook: ParsedWorkbook): ServerWorkbook => ({ label, workbook })

describe('estateWarnings', () => {
  it('returns a single source\'s warnings unchanged (no attribution prefix)', () => {
    const only = wb({ warnings: ['Sheet "Copies" reached the cap'] })
    expect(estateWarnings([srv('a', only)])).toEqual(['Sheet "Copies" reached the cap'])
  })

  it('adds the mixed-format umbrella when detail and summary servers are combined', () => {
    const detail = wb({ sheets: { Copies: { name: 'Copies', headers: [], rows: [], capped: false } } })
    const summary = wb({
      sheets: {
        'System Configuration': { name: 'System Configuration', headers: [], rows: [], capped: false },
        'VMs Count And Cap': { name: 'VMs Count And Cap', headers: [], rows: [], capped: false },
      },
    })
    const out = estateWarnings([srv('new', detail), srv('old', summary)])
    expect(out.some((w) => /mixes detail-format and summary-format/i.test(w))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/parser/estateWarnings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/engines/parser/estateWarnings.ts` by moving the body of `mergeWarnings` out of `mergeWorkbooks.ts` and adding the guard + umbrella:

```ts
import type { ServerWorkbook } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'
import { detectFormat } from './detectFormat'
import { appHostName } from './deriveLabel'

/** Estate-level data caveats (always warn, never block). Single source → its own warnings, verbatim. */
export function estateWarnings(servers: ServerWorkbook[]): string[] {
  if (servers.length <= 1) return servers[0]?.workbook.warnings ?? []
  const out: string[] = []

  for (const s of servers) {
    for (const w of s.workbook.warnings) out.push(`[${s.label}] ${w}`)
  }

  const bases = new Set(servers.map((s) => s.workbook.meta.baseTen))
  if (bases.size > 1) {
    out.push(
      'Source exports mix base-10 and base-2 units; combined capacity figures span different measurement scales.',
    )
  }

  const seen = new Map<string, string>()
  for (const s of servers) {
    const host = appHostName(s.workbook)
    const key = host || `${s.workbook.meta.projectId}|${s.workbook.meta.capturedAt}`
    if (!key || key === '|') continue
    const prev = seen.get(key)
    if (prev) {
      out.push(
        `"${prev}" and "${s.label}" appear to be the same PPDM server/snapshot; figures may be double-counted.`,
      )
    } else {
      seen.set(key, s.label)
    }
  }

  const names = new Set(servers.flatMap((s) => Object.keys(s.workbook.sheets)))
  const multiCapped = [...names].some(
    (name) => servers.filter((s) => s.workbook.sheets[name]?.capped).length >= 2,
  )
  if (multiCapped) {
    out.push(
      `One or more sheets reached the ${LIVE_OPTICS_ROW_CAP.toLocaleString()}-row cap in multiple source servers; combined figures from them blend independent windows, not the full set.`,
    )
  }

  const formats = new Set(servers.map((s) => detectFormat(s.workbook)))
  if (formats.size > 1) {
    out.push(
      'Estate mixes detail-format and summary-format exports; metrics marked with a coverage note reflect only the servers that provide that data.',
    )
  }

  return out
}
```

In `mergeWorkbooks.ts`, replace the local `mergeWarnings` function and its call with a delegation:

```ts
import { estateWarnings } from './estateWarnings'
// ...
  return { meta, sheets, inUse, idleAgents, warnings: estateWarnings(servers) }
```

Delete the now-unused `mergeWarnings` function and its `LIVE_OPTICS_ROW_CAP`/`appHostName` imports if they are no longer referenced elsewhere in the file (the `classifyAgents` import stays).

- [ ] **Step 4: Run tests to verify pass + no regression**

Run: `npx vitest run src/engines/parser/estateWarnings.test.ts src/engines/parser/mergeWorkbooks.test.ts`
Expected: PASS. (If a `mergeWorkbooks` warning test asserted the exact multi-source list, it still passes — all-detail estates produce no umbrella.)

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/estateWarnings.ts src/engines/parser/mergeWorkbooks.ts src/engines/parser/estateWarnings.test.ts
git commit -m "feat(parser): extract estateWarnings + mixed-format umbrella warning"
```

---

### Task 10: Rewire `useReportView` to the view-level merge

**Files:**
- Modify: `src/hooks/useReportView.ts`
- Test: `src/hooks/useReportView.test.ts` (add a mixed-estate case)

**Interfaces:**
- Consumes: `buildReportView` (Task 7), `mergeViews` (Task 8), `estateWarnings` (Task 9), `appVersion` (Task 3).
- Produces: `useReportView(): EstateView | null` with `combined = { ...mergeViews(perServerViews), warnings: estateWarnings(servers) }`.

- [ ] **Step 1: Write the failing test** — add to `useReportView.test.ts` (follow the file's existing render/store-seeding pattern; sketch):

```ts
it('merges a summary server into the estate with a coverage note and umbrella warning', () => {
  // Seed the store with one detail ServerWorkbook (ref/PPDM.xlsx) and one summary
  // ServerWorkbook (ref/chuv-a1n01136i.xlsx) via the store's addServers, mirroring
  // the existing multi-server test setup in this file.
  const estate = renderHookValue() // existing helper/pattern in this test file
  expect(estate?.multiSource).toBe(true)
  expect(estate?.combined.provenance.compliance).toMatchObject({ available: true, serversTotal: 2 })
  expect(estate?.combined.warnings.some((w) => /mixes detail-format and summary-format/i.test(w))).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useReportView.test.ts`
Expected: FAIL — current `combined` uses `mergeWorkbooks` (no provenance/umbrella in this shape).

- [ ] **Step 3: Write minimal implementation**

```ts
import { useMemo } from 'react'
import { buildReportView } from '../engines/aggregation/reportView'
import { mergeViews } from '../engines/aggregation/mergeViews'
import { appVersion } from '../engines/parser/deriveLabel'
import { estateWarnings } from '../engines/parser/estateWarnings'
import { useReportStore } from '../store/reportStore'
import type { EstateView } from '../types/reportView'

/** The single derivation point: stored servers → EstateView (null when none loaded). */
export function useReportView(): EstateView | null {
  const servers = useReportStore((s) => s.servers)
  return useMemo(() => {
    if (servers.length === 0) return null
    const perServer = servers.map((s) => ({
      label: s.label,
      version: appVersion(s.workbook),
      view: buildReportView(s.workbook),
    }))
    return {
      combined: { ...mergeViews(perServer.map((p) => p.view)), warnings: estateWarnings(servers) },
      perServer,
      multiSource: servers.length > 1,
    }
  }, [servers])
}
```

- [ ] **Step 4: Run the broad suite to verify pass + no regression**

Run: `npx vitest run src/hooks src/engines/aggregation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useReportView.ts src/hooks/useReportView.test.ts
git commit -m "feat(hooks): useReportView merges at the view level (mergeViews + estateWarnings)"
```

---

### Task 11: `ProvenanceNote` component + i18n keys

**Files:**
- Create: `src/components/dashboard/ProvenanceNote.tsx`
- Modify: `src/i18n/locales/{en,de,fr,it}/dashboard.json`
- Test: `src/components/dashboard/ProvenanceNote.test.tsx`

**Interfaces:**
- Consumes: `MetricProvenance` from `../../types/reportView`; `react-i18next`.
- Produces: `export function ProvenanceNote({ p, dark }: { p: MetricProvenance; dark: boolean }): JSX.Element | null` — renders nothing when fully available, a partial note when partial, an unavailable note when `!available`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProvenanceNote } from './ProvenanceNote'

describe('ProvenanceNote', () => {
  it('renders nothing when fully available', () => {
    const { container } = render(
      <ProvenanceNote p={{ available: true, serversCovered: 2, serversTotal: 2 }} dark={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an unavailable note', () => {
    render(<ProvenanceNote p={{ available: false, serversCovered: 0, serversTotal: 3 }} dark={false} />)
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })

  it('renders a partial coverage note', () => {
    render(<ProvenanceNote p={{ available: true, serversCovered: 1, serversTotal: 4 }} dark={false} />)
    expect(screen.getByText(/1.*4/)).toBeInTheDocument()
  })
})
```

> The test relies on i18next returning the real English strings, matching how `sections.test.tsx` renders dashboard components. Follow that file's i18n test setup (import `../../i18n` or the shared test render helper) so `t` resolves.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/ProvenanceNote.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useTranslation } from 'react-i18next'
import type { MetricProvenance } from '../../types/reportView'

const FONT = 'Arial, Helvetica, sans-serif'

/** A small caveat under a detail-only metric: unavailable, or partial coverage. Null when full. */
export function ProvenanceNote({ p, dark }: { p: MetricProvenance; dark: boolean }) {
  const { t } = useTranslation('dashboard')
  if (p.available && p.serversCovered >= p.serversTotal) return null

  const text = !p.available
    ? t('provenance.unavailable')
    : p.assetsCovered !== undefined && p.assetsTotal !== undefined
      ? t('provenance.partialAssets', {
          covered: p.serversCovered,
          total: p.serversTotal,
          assetsCovered: p.assetsCovered,
          assetsTotal: p.assetsTotal,
        })
      : t('provenance.partial', { covered: p.serversCovered, total: p.serversTotal })

  return (
    <p
      className={`mt-2 text-xs italic ${dark ? 'text-slate-400' : 'text-slate-500'}`}
      style={{ fontFamily: FONT }}
    >
      {text}
    </p>
  )
}
```

Add to **each** of `src/i18n/locales/{en,de,fr,it}/dashboard.json` a `provenance` object. English:

```json
"provenance": {
  "unavailable": "Not available for summary-format reports",
  "partial": "Covers {{covered}} of {{total}} servers",
  "partialAssets": "Covers {{covered}} of {{total}} servers ({{assetsCovered}} of {{assetsTotal}} assets)"
}
```

German (`de`):

```json
"provenance": {
  "unavailable": "Für Berichte im Summenformat nicht verfügbar",
  "partial": "Deckt {{covered}} von {{total}} Servern ab",
  "partialAssets": "Deckt {{covered}} von {{total}} Servern ab ({{assetsCovered}} von {{assetsTotal}} Assets)"
}
```

French (`fr`):

```json
"provenance": {
  "unavailable": "Non disponible pour les rapports au format synthétique",
  "partial": "Couvre {{covered}} serveurs sur {{total}}",
  "partialAssets": "Couvre {{covered}} serveurs sur {{total}} ({{assetsCovered}} actifs sur {{assetsTotal}})"
}
```

Italian (`it`):

```json
"provenance": {
  "unavailable": "Non disponibile per i report in formato riepilogativo",
  "partial": "Copre {{covered}} server su {{total}}",
  "partialAssets": "Copre {{covered}} server su {{total}} ({{assetsCovered}} asset su {{assetsTotal}})"
}
```

- [ ] **Step 4: Run component + i18n parity tests to verify pass**

Run: `npx vitest run src/components/dashboard/ProvenanceNote.test.tsx src/i18n/keyParity.test.ts`
Expected: PASS (parity green across all four locales).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ProvenanceNote.tsx src/components/dashboard/ProvenanceNote.test.tsx src/i18n/locales
git commit -m "feat(dashboard): ProvenanceNote component + i18n keys (4 locales)"
```

---

### Task 12: Wire `ProvenanceNote` into the four detail-only sections

**Files:**
- Modify: `src/components/dashboard/CoverageSection.tsx` (key `coverageByType`)
- Modify: `src/components/dashboard/GapsSection.tsx` (key `gapsList`)
- Modify: `src/components/dashboard/JobsComplianceSection.tsx` (key `compliance`)
- Modify: `src/components/dashboard/CapacitySection.tsx` (key `storageTargets`)
- Test: `src/components/dashboard/sections.test.tsx` (add summary-provenance cases)

**Interfaces:**
- Consumes: `ProvenanceNote` (Task 11); each section already receives `{ view: ReportView; dark: boolean }` and can read `view.provenance[key]`.

- [ ] **Step 1: Write the failing test** — add to `sections.test.tsx`, building a summary-provenance `ReportView` (reuse the file's existing `view` fixture helper, overriding `provenance` with `allUnavailable(100)`):

```tsx
import { allUnavailable } from '../../engines/aggregation/provenance'

it('CapacitySection shows the unavailable note for summary provenance', () => {
  const view = makeView({ provenance: allUnavailable(100) }) // makeView = this file's existing fixture helper
  render(<CapacitySection view={view} dark={false} />)
  expect(screen.getByText(/not available/i)).toBeInTheDocument()
})

it('JobsComplianceSection shows the unavailable note for summary provenance', () => {
  const view = makeView({ provenance: allUnavailable(100) })
  render(<JobsComplianceSection view={view} dark={false} />)
  expect(screen.getByText(/not available/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/sections.test.tsx`
Expected: FAIL — no "not available" text rendered.

- [ ] **Step 3: Write minimal implementation**

In each of the four components, import the note and render it before the closing `</section>` with the matching key. For example, in `CapacitySection.tsx`:

```tsx
import { ProvenanceNote } from './ProvenanceNote'
// ...just before </section> (around line 97):
      <ProvenanceNote p={view.provenance.storageTargets} dark={dark} />
    </section>
```

Apply the same pattern with the corresponding key:
- `CoverageSection.tsx`: `<ProvenanceNote p={view.provenance.coverageByType} dark={dark} />`
- `GapsSection.tsx`: `<ProvenanceNote p={view.provenance.gapsList} dark={dark} />`
- `JobsComplianceSection.tsx`: `<ProvenanceNote p={view.provenance.compliance} dark={dark} />`

- [ ] **Step 4: Run dashboard tests to verify pass + no regression**

Run: `npx vitest run src/components/dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/CoverageSection.tsx src/components/dashboard/GapsSection.tsx src/components/dashboard/JobsComplianceSection.tsx src/components/dashboard/CapacitySection.tsx src/components/dashboard/sections.test.tsx
git commit -m "feat(dashboard): surface provenance notes on the four detail-only sections"
```

---

### Task 13: Surface provenance in exports (`buildExportModel`)

**Files:**
- Modify: `src/engines/export/buildExportModel.ts`
- Test: `src/engines/export/buildExportModel.test.ts` (add a summary-provenance case)

**Interfaces:**
- Consumes: `view.provenance` on the combined `ReportView`; the existing `ExportSection`/`DeckSection` types (`notes?: string[]`, `deck.caveat?: string`).
- Produces: the `coverage`, `gaps`, `compliance`, `capacity` sections carry a provenance caveat (appended to `notes` and `deck.caveat`) when the matching metric is unavailable or partial.

- [ ] **Step 1: Write the failing test**

```ts
import { allUnavailable } from '../aggregation/provenance'
// within the existing describe, using this file's existing view/theme/t fixtures:
it('appends an unavailable caveat to detail-only sections for summary provenance', () => {
  const view = makeView({ provenance: allUnavailable(100) }) // existing fixture helper in this test file
  const model = buildExportModel(view, 'assessment', theme, t, 'en', [])
  const compliance = model.sections.find((s) => s.id === 'compliance')
  expect(compliance?.deck?.caveat ?? compliance?.notes?.join(' ')).toMatch(/not available/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts`
Expected: FAIL — no caveat present.

- [ ] **Step 3: Write minimal implementation**

Add a helper near the top of `buildExportModel.ts` and apply it where the four sections are assembled:

```ts
import type { MetricKey, MetricProvenance } from '../../types/reportView'

/** Localized provenance caveat for a detail-only section; '' when fully available. */
function provenanceCaveat(p: MetricProvenance, t: TFn): string {
  if (p.available && p.serversCovered >= p.serversTotal) return ''
  if (!p.available) return t('provenance.unavailable')
  return p.assetsCovered !== undefined && p.assetsTotal !== undefined
    ? t('provenance.partialAssets', {
        covered: p.serversCovered, total: p.serversTotal,
        assetsCovered: p.assetsCovered, assetsTotal: p.assetsTotal,
      })
    : t('provenance.partial', { covered: p.serversCovered, total: p.serversTotal })
}

/** Fold a provenance caveat into a section's notes + deck caveat. */
function withCaveat(section: ExportSection, key: MetricKey, view: ReportView, t: TFn): ExportSection {
  const note = provenanceCaveat(view.provenance[key], t)
  if (!note) return section
  return {
    ...section,
    notes: [...(section.notes ?? []), note],
    deck: { ...section.deck, caveat: [section.deck?.caveat, note].filter(Boolean).join(' · ') },
  }
}
```

Wrap the four sections as they are pushed/returned, e.g.:

```ts
withCaveat(coverageSection, 'coverageByType', view, t)
withCaveat(gapsSection, 'gapsList', view, t)
withCaveat(complianceSection, 'compliance', view, t)
withCaveat(capacitySection, 'storageTargets', view, t)
```

> Use the actual local variable names for those sections in this file; if sections are built inline in the returned `sections` array, wrap each in place. `t` here resolves dashboard-namespaced keys; if `buildExportModel`'s `t` is bound to a different namespace, prefix the keys accordingly (e.g. `dashboard:provenance.unavailable`) to match how other dashboard strings are referenced in this file.

- [ ] **Step 4: Run export tests to verify pass + no regression**

Run: `npx vitest run src/engines/export`
Expected: PASS (`keyParity` unaffected; existing export snapshots still match for detail views since fully-available provenance yields no caveat).

- [ ] **Step 5: Commit**

```bash
git add src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts
git commit -m "feat(export): carry provenance caveats into HTML/PPTX sections"
```

---

### Task 14: ADR + docs

**Files:**
- Create: `docs/adr/0010-format-aware-ingestion.md`
- Modify: `docs/adr/0009-estate-merge-model.md` (note the merge moved to the view level)
- Modify: `docs/adr/README.md` (index the new ADR)
- Modify: `README.md`, `docs/USER-GUIDE.md` (older exports supported; what's unavailable and why)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Write ADR 0010**

Create `docs/adr/0010-format-aware-ingestion.md` following the style of the existing ADRs (Context / Decision / Consequences). Cover: the summary vs detail split and `detectFormat` signature; `buildReportView` dispatch; the merge moving from `mergeWorkbooks` (sheet-level) to `mergeViews` (view-level) with `mergeWorkbooks` retained only as the parity reference; the additive `provenance` model and the four unavailable metrics for summary exports; that estate semantics (warnings, labels) are unchanged.

- [ ] **Step 2: Touch ADR 0009 + README + USER-GUIDE**

In `docs/adr/0009-estate-merge-model.md`, add a short note that the merge mechanism is now `mergeViews` at the view level (superseding the sheet-level `mergeWorkbooks` runtime path; estate model unchanged) and link to ADR 0010. Add the `0010` row to `docs/adr/README.md`. In `README.md` and `docs/USER-GUIDE.md`, add a short paragraph: older summary-format PPDM exports are supported and can be mixed with current exports; per-asset detail (copy immutability/replication, storage utilization, the unprotected-asset list, per-type coverage) is not present in older exports and is shown as "not available" with a coverage note.

- [ ] **Step 3: Verify the whole suite + typecheck + lint are green**

Run: `npm run typecheck && npm run lint && npm run test:run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0010-format-aware-ingestion.md docs/adr/0009-estate-merge-model.md docs/adr/README.md README.md docs/USER-GUIDE.md
git commit -m "docs: ADR 0010 format-aware ingestion + user-facing notes"
```

---

## Notes for the implementer

- **No upload/store changes are needed.** Summary files already parse through `normalizeWorkbook` (generic sheet reader), get a label from `deriveLabel` (their `System Information` has `Host Name`), and append via the existing `addServers`. They become `ServerWorkbook`s exactly like detail files.
- **`mergeWorkbooks` is intentionally kept** (not deleted) after Task 10 removes it from the runtime path: it remains the reference implementation that the `mergeViews.parity.test.ts` gate compares against. Do not delete it.
- **Run order matters between Tasks 4–7:** the codebase will not fully typecheck between Task 4 and Task 5 (the `provenance` field becomes required in Task 5). Land them in sequence; only run the *targeted* test files indicated until Task 5 is complete, then `npm run typecheck` should pass again.

## Self-Review

**Spec coverage:** Part 1 (format detection) → Task 1; metadata tolerances → Tasks 2–3; Part 2 (summary extractor + availability matrix) → Task 6; provenance model → Task 5; compliance raw counts → Task 4; `mergeViews` + foldMeta + parity → Task 8; estate warnings + umbrella → Task 9; derivation rewire → Task 10; dashboard surfacing → Tasks 11–12; export surfacing → Task 13; docs/ADR → Task 14. All spec sections map to a task.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The two places that defer to "this file's existing fixture helper" (`makeView`, `renderHookValue`, export `t`/`theme`) point at concrete existing patterns the implementer reads in-file rather than inventing — acceptable because the helpers already exist and their exact names vary by file.

**Type consistency:** `MetricKey`/`MetricProvenance`/`provenance` are defined in Task 5 and consumed identically in Tasks 6, 8, 11, 12, 13. `allAvailable`/`allUnavailable` signatures (one `assetsTotal: number` arg) are consistent across Tasks 5, 6, 8, 12, 13. `Compliance` count field names (`appConsistentCount`/`immutableCount`/`replicatedCount`) match between Task 4 (definition), Task 6 (summaryView zeros), and Task 8 (merge). `finalizeBand`/`emptyBand` exported in Task 5, consumed in Tasks 6 and 8. `detectFormat`/`WorkbookFormat` from Task 1 consumed in Tasks 7 and 9.
