# PPDM Report — Plan 2: Metric Engines

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the parsed `ParsedWorkbook` into a single derived `ReportView` of value metrics — protection coverage, gaps/opportunity, job health, compliance/SLA, capacity risk, policies — via pure functions, exposed through one bridge hook.

**Architecture:** Pure functional `engines/aggregation/` modules, each `(ParsedWorkbook) → value`, composed once in `buildReportView`. A single `useReportView` hook is the only `useMemo` bridging store → UI. No metric logic in the store or UI. Reads the typed sheet rows produced by Plan 1.

**Tech Stack:** TypeScript (strict), Vitest. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-06-18-ppdm-report-design.md` (§5 metric model). **Builds on** Plan 1 (`src/types/ppdm.ts`, `src/engines/parser/*`, `src/store/reportStore.ts`).

## Global Constraints

- **Pure FP in `engines/`** — no classes, no mutation, no side effects, no React/DOM/store/xlsx imports. Engines take data in, return data out.
- **Determinism** — no `Date.now()`/`new Date()` inside engines; any "now" is a parameter.
- **No silent caps** — metrics derived from the capped `Copies` / `Protection Job Activities` sheets MUST carry `{ capped: boolean, windowSize: number }` so the UI can print the caveat. Totals that can come from un-capped aggregate sheets (`Unprotected Assets`, `Policies`, `Storage Targets`, asset-type counts) must come from those, not by counting capped sheets.
- **Coverage** — headline `pct = PROTECTED/(PROTECTED+UNPROTECTED)`; secondary `pctInclExcluded = PROTECTED/(PROTECTED+UNPROTECTED+EXCLUDED)`. Both always returned; EXCLUDED never silently folded in.
- **DRY** — one `topN` helper for every "top N of total" list; one `reportView` composition root; one `useReportView` memo.
- **Quality first** — every task ends green: `npm run test:run`, `npm run typecheck`, `npm run lint` (run biome via `rtk proxy node_modules/.bin/biome check .` to avoid the proxy mangling output), `npm run build`, and `npm run test:coverage` (engines/utils/privacy ≥75%). No failing/skipped tests; no silent fallbacks.
- **Base-10 units** — sizes are GB/TB base-10 (the export declares it); use the existing `src/utils/format.ts` helpers for any display, but engines return raw numbers.

## File Structure

```
src/types/reportView.ts                         # ReportView + sub-result types
src/engines/aggregation/
├── rows.ts (+ .test.ts)                         # typed cell accessors over Record<string,Cell>
├── topN.ts (+ .test.ts)                          # generic { items, total, shown } capper
├── coverage.ts (+ .test.ts)                      # per-type + overall protection bands
├── gaps.ts (+ .test.ts)                          # unprotected count, total capacity, topN
├── jobs.ts (+ .test.ts)                          # job result mix + successPct (+ capped)
├── compliance.ts (+ .test.ts)                    # consistency / immutability / replication / level mix (+ capped)
├── capacity.ts (+ .test.ts)                      # storage-target utilization + flags + mtree count
├── policies.ts (+ .test.ts)                      # count, byPurpose, perPolicy rows
└── reportView.ts (+ .test.ts)                    # composition root → ReportView
src/hooks/useReportView.ts (+ .test.ts)          # the single useMemo: store → ReportView
```

---

## Task 1: ReportView types

**Files:** Create `src/types/reportView.ts`

**Interfaces:**
- Consumes: `ProtectionStatus`, `CaptureMeta` from `./ppdm`.
- Produces: all result types below. Consumed by every engine + the hook.

- [ ] **Step 1: Write `src/types/reportView.ts`**

```ts
import type { CaptureMeta } from './ppdm'

/** Protection counts + both coverage figures for one scope (a type, or the whole estate). */
export interface CoverageBand {
  protected: number
  unprotected: number
  excluded: number
  /** PROTECTED / (PROTECTED + UNPROTECTED); 0 when denominator is 0. */
  pct: number
  /** PROTECTED / (PROTECTED + UNPROTECTED + EXCLUDED); 0 when denominator is 0. */
  pctInclExcluded: number
}

export interface Coverage {
  byType: Record<string, CoverageBand>
  overall: CoverageBand
}

/** A capped "top N of total" list. */
export interface TopList<T> {
  items: T[]
  total: number
  shown: number
}

export interface UnprotectedAsset {
  name: string
  type: string
  sizeGb: number
}

export interface Gaps {
  count: number
  totalCapacityGb: number
  top: TopList<UnprotectedAsset>
}

export interface Jobs {
  counts: Record<string, number>
  total: number
  successPct: number
  capped: boolean
  windowSize: number
}

export interface Compliance {
  appConsistentPct: number
  immutablePct: number
  replicatedPct: number
  backupLevelMix: Record<string, number>
  windowSize: number
  capped: boolean
}

export interface StorageTarget {
  name: string
  type: string
  utilizationPct: number
  flagged: boolean
}

export interface Capacity {
  targets: StorageTarget[]
  flagged: StorageTarget[]
  mtreeCount: number
}

export interface PolicyRow {
  name: string
  purpose: string
  assetCount: number
  protectionCapacityGb: number
}

export interface Policies {
  count: number
  byPurpose: Record<string, number>
  perPolicy: PolicyRow[]
}

/** The single derived view of the whole report. Recomputed, never stored. */
export interface ReportView {
  meta: CaptureMeta
  inUse: string[]
  idleAgents: string[]
  warnings: string[]
  coverage: Coverage
  gaps: Gaps
  jobs: Jobs
  compliance: Compliance
  capacity: Capacity
  policies: Policies
}
```

- [ ] **Step 2:** `npm run typecheck` → no errors.
- [ ] **Step 3:** `git add src/types/reportView.ts && git commit -m "feat: add ReportView result types"`

---

## Task 2: Typed cell accessors

**Files:** Create `src/engines/aggregation/rows.ts`, `src/engines/aggregation/rows.test.ts`

**Interfaces:**
- Produces: `cellStr(row, key): string`, `cellNum(row, key): number`, `countBy(rows, key): Record<string, number>`. Consumed by all engines.

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/rows.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { cellNum, cellStr, countBy } from './rows'

describe('cell accessors', () => {
  it('cellStr trims and returns "" for null/N-A/missing', () => {
    expect(cellStr({ a: '  hi ' }, 'a')).toBe('hi')
    expect(cellStr({ a: null }, 'a')).toBe('')
    expect(cellStr({}, 'a')).toBe('')
    expect(cellStr({ a: 'N/A' }, 'a')).toBe('')
  })

  it('cellNum parses numbers and strips commas; 0 for non-numeric', () => {
    expect(cellNum({ a: 12.5 }, 'a')).toBe(12.5)
    expect(cellNum({ a: '1,234.5' }, 'a')).toBe(1234.5)
    expect(cellNum({ a: 'N/A' }, 'a')).toBe(0)
    expect(cellNum({}, 'a')).toBe(0)
  })

  it('countBy tallies a column, skipping blanks', () => {
    const rows = [{ s: 'A' }, { s: 'A' }, { s: 'B' }, { s: 'N/A' }]
    expect(countBy(rows, 's')).toEqual({ A: 2, B: 1 })
  })
})
```

- [ ] **Step 2:** Run `npx vitest run src/engines/aggregation/rows.test.ts` → FAIL (module not found).
- [ ] **Step 3: Write** `src/engines/aggregation/rows.ts`

```ts
import type { Cell } from '../../types/ppdm'

type Row = Record<string, Cell>

/** Trimmed string for a column; '' for null/empty/'N/A'/missing. */
export function cellStr(row: Row, key: string): string {
  const v = row[key]
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  return s === 'N/A' ? '' : s
}

/** Numeric value for a column (commas stripped); 0 when absent/non-numeric. */
export function cellNum(row: Row, key: string): number {
  const v = row[key]
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = cellStr(row, key).replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) && s !== '' ? n : 0
}

/** Tally non-blank values of a column. */
export function countBy(rows: Row[], key: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const k = cellStr(row, key)
    if (k) out[k] = (out[k] ?? 0) + 1
  }
  return out
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/rows.ts src/engines/aggregation/rows.test.ts && git commit -m "feat: add typed cell accessors for aggregation engines"`

---

## Task 3: topN helper

**Files:** Create `src/engines/aggregation/topN.ts`, `src/engines/aggregation/topN.test.ts`

**Interfaces:**
- Produces: `topN<T>(items: T[], n: number, score: (t: T) => number): TopList<T>` (descending by score). Consumed by `gaps` and later slides.

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/topN.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { topN } from './topN'

describe('topN', () => {
  it('returns the top N by descending score with total and shown', () => {
    const items = [{ s: 3 }, { s: 1 }, { s: 5 }, { s: 2 }]
    const r = topN(items, 2, (x) => x.s)
    expect(r.items).toEqual([{ s: 5 }, { s: 3 }])
    expect(r.total).toBe(4)
    expect(r.shown).toBe(2)
  })

  it('shown never exceeds total', () => {
    const r = topN([{ s: 1 }], 25, (x) => x.s)
    expect(r.total).toBe(1)
    expect(r.shown).toBe(1)
    expect(r.items).toHaveLength(1)
  })

  it('does not mutate the input array', () => {
    const items = [{ s: 1 }, { s: 2 }]
    topN(items, 1, (x) => x.s)
    expect(items).toEqual([{ s: 1 }, { s: 2 }])
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/engines/aggregation/topN.ts`

```ts
import type { TopList } from '../../types/reportView'

/** Top `n` items by descending `score`, with the true total and shown count. Pure (no input mutation). */
export function topN<T>(items: T[], n: number, score: (t: T) => number): TopList<T> {
  const sorted = [...items].sort((a, b) => score(b) - score(a))
  const top = sorted.slice(0, Math.max(0, n))
  return { items: top, total: items.length, shown: top.length }
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/topN.ts src/engines/aggregation/topN.test.ts && git commit -m "feat: add topN list-capping helper"`

---

## Task 4: Coverage engine

**Files:** Create `src/engines/aggregation/coverage.ts`, `src/engines/aggregation/coverage.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook`, `AGENT_SHEETS` from `../../types/ppdm`; `cellStr` from `./rows`; `Coverage`/`CoverageBand` from `../../types/reportView`.
- Produces: `computeCoverage(wb: ParsedWorkbook): Coverage`. Counts only `wb.inUse` sheets; reads each row's `Protection Status` ∈ {PROTECTED, UNPROTECTED, EXCLUDED}.

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/coverage.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { computeCoverage } from './coverage'

function wb(sheets: Record<string, Array<Record<string, string>>>, inUse: string[]): ParsedWorkbook {
  const sheetData: Record<string, SheetData> = {}
  for (const [name, rows] of Object.entries(sheets)) {
    sheetData[name] = { name, headers: Object.keys(rows[0] ?? {}), rows, capped: false }
  }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: sheetData,
    inUse,
    idleAgents: [],
    warnings: [],
  }
}

describe('computeCoverage', () => {
  it('computes per-type and overall bands with both coverage figures', () => {
    const cov = computeCoverage(
      wb(
        {
          'SQL Databases': [
            ...Array(380).fill({ 'Protection Status': 'PROTECTED' }),
            ...Array(150).fill({ 'Protection Status': 'UNPROTECTED' }),
            ...Array(224).fill({ 'Protection Status': 'EXCLUDED' }),
          ],
        },
        ['SQL Databases'],
      ),
    )
    const sql = cov.byType['SQL Databases']
    expect(sql.protected).toBe(380)
    expect(sql.unprotected).toBe(150)
    expect(sql.excluded).toBe(224)
    expect(sql.pct).toBeCloseTo(380 / 530, 4)
    expect(sql.pctInclExcluded).toBeCloseTo(380 / 754, 4)
    expect(cov.overall.protected).toBe(380)
  })

  it('returns 0 pct for an empty denominator, never NaN', () => {
    const cov = computeCoverage(wb({ 'File Systems': [{ 'Protection Status': 'EXCLUDED' }] }, ['File Systems']))
    expect(cov.byType['File Systems'].pct).toBe(0)
    expect(cov.byType['File Systems'].pctInclExcluded).toBe(0)
  })

  it('ignores sheets not in inUse', () => {
    const cov = computeCoverage(
      wb({ 'Oracle Databases': [{ 'Protection Status': 'PROTECTED' }] }, []),
    )
    expect(cov.byType['Oracle Databases']).toBeUndefined()
    expect(cov.overall.protected).toBe(0)
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/engines/aggregation/coverage.ts`

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { Coverage, CoverageBand } from '../../types/reportView'
import { cellStr } from './rows'

function emptyBand(): CoverageBand {
  return { protected: 0, unprotected: 0, excluded: 0, pct: 0, pctInclExcluded: 0 }
}

function finalize(b: CoverageBand): CoverageBand {
  const denom = b.protected + b.unprotected
  const denomAll = denom + b.excluded
  return {
    ...b,
    pct: denom > 0 ? b.protected / denom : 0,
    pctInclExcluded: denomAll > 0 ? b.protected / denomAll : 0,
  }
}

/** Protection coverage per in-use asset type and overall. */
export function computeCoverage(wb: ParsedWorkbook): Coverage {
  const byType: Record<string, CoverageBand> = {}
  const overall = emptyBand()

  for (const name of wb.inUse) {
    const sheet = wb.sheets[name]
    if (!sheet) continue
    const band = emptyBand()
    for (const row of sheet.rows) {
      const status = cellStr(row, 'Protection Status')
      if (status === 'PROTECTED') band.protected++
      else if (status === 'UNPROTECTED') band.unprotected++
      else if (status === 'EXCLUDED') band.excluded++
    }
    overall.protected += band.protected
    overall.unprotected += band.unprotected
    overall.excluded += band.excluded
    byType[name] = finalize(band)
  }

  return { byType, overall: finalize(overall) }
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/coverage.ts src/engines/aggregation/coverage.test.ts && git commit -m "feat: add protection coverage engine"`

---

## Task 5: Gaps engine

**Files:** Create `src/engines/aggregation/gaps.ts`, `src/engines/aggregation/gaps.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook`; `cellStr`/`cellNum` from `./rows`; `topN` from `./topN`; `Gaps`/`UnprotectedAsset` from `../../types/reportView`.
- Produces: `findGaps(wb: ParsedWorkbook, n = 25): Gaps`. Reads the `Unprotected Assets` sheet (`Name`, `Type`, `Size (GB)`).

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/gaps.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { findGaps } from './gaps'

function wb(rows: Array<Record<string, string>>): ParsedWorkbook {
  const sheet: SheetData = { name: 'Unprotected Assets', headers: ['Name', 'Type', 'Size (GB)'], rows, capped: false }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: { 'Unprotected Assets': sheet },
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('findGaps', () => {
  it('sums capacity and returns the top N unprotected by size', () => {
    const g = findGaps(
      wb([
        { Name: 'a', Type: 'VM', 'Size (GB)': '100' },
        { Name: 'b', Type: 'VM', 'Size (GB)': '300' },
        { Name: 'c', Type: 'VM', 'Size (GB)': '50' },
      ]),
      2,
    )
    expect(g.count).toBe(3)
    expect(g.totalCapacityGb).toBe(450)
    expect(g.top.items.map((x) => x.name)).toEqual(['b', 'a'])
    expect(g.top.total).toBe(3)
    expect(g.top.shown).toBe(2)
  })

  it('returns zeros and empty top when the sheet is absent', () => {
    const g = findGaps({
      meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
      sheets: {},
      inUse: [],
      idleAgents: [],
      warnings: [],
    })
    expect(g.count).toBe(0)
    expect(g.totalCapacityGb).toBe(0)
    expect(g.top.items).toEqual([])
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/engines/aggregation/gaps.ts`

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { Gaps, UnprotectedAsset } from '../../types/reportView'
import { cellNum, cellStr } from './rows'
import { topN } from './topN'

/** Unprotected-asset gaps: count, total capacity, and the largest N by size. */
export function findGaps(wb: ParsedWorkbook, n = 25): Gaps {
  const rows = wb.sheets['Unprotected Assets']?.rows ?? []
  const assets: UnprotectedAsset[] = rows.map((r) => ({
    name: cellStr(r, 'Name'),
    type: cellStr(r, 'Type'),
    sizeGb: cellNum(r, 'Size (GB)'),
  }))
  const totalCapacityGb = assets.reduce((sum, a) => sum + a.sizeGb, 0)
  return { count: assets.length, totalCapacityGb, top: topN(assets, n, (a) => a.sizeGb) }
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/gaps.ts src/engines/aggregation/gaps.test.ts && git commit -m "feat: add unprotected-gaps engine"`

---

## Task 6: Jobs engine

**Files:** Create `src/engines/aggregation/jobs.ts`, `src/engines/aggregation/jobs.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook`; `countBy` from `./rows`; `Jobs` from `../../types/reportView`.
- Produces: `computeJobs(wb): Jobs`. Reads `Protection Job Activities` (`Result` column). `successPct = SUCCESS / total`. `capped`/`windowSize` from the sheet.

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/jobs.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { computeJobs } from './jobs'

function wb(rows: Array<Record<string, string>>, capped: boolean): ParsedWorkbook {
  const sheet: SheetData = { name: 'Protection Job Activities', headers: ['Result'], rows, capped }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: { 'Protection Job Activities': sheet },
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('computeJobs', () => {
  it('tallies results, computes success %, and propagates the cap flag', () => {
    const j = computeJobs(
      wb(
        [
          ...Array(9297).fill({ Result: 'SUCCESS' }),
          ...Array(635).fill({ Result: 'RETRIED' }),
          ...Array(66).fill({ Result: 'SKIPPED' }),
          ...Array(2).fill({ Result: 'CANCELED' }),
        ],
        true,
      ),
    )
    expect(j.total).toBe(10000)
    expect(j.counts.SUCCESS).toBe(9297)
    expect(j.successPct).toBeCloseTo(0.9297, 4)
    expect(j.capped).toBe(true)
    expect(j.windowSize).toBe(10000)
  })

  it('is safe when the sheet is absent', () => {
    const j = computeJobs({
      meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
      sheets: {},
      inUse: [],
      idleAgents: [],
      warnings: [],
    })
    expect(j.total).toBe(0)
    expect(j.successPct).toBe(0)
    expect(j.capped).toBe(false)
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/engines/aggregation/jobs.ts`

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { Jobs } from '../../types/reportView'
import { countBy } from './rows'

/** Protection-job result mix and success rate over the (possibly capped) activity window. */
export function computeJobs(wb: ParsedWorkbook): Jobs {
  const sheet = wb.sheets['Protection Job Activities']
  const rows = sheet?.rows ?? []
  const counts = countBy(rows, 'Result')
  const total = rows.length
  const success = counts.SUCCESS ?? 0
  return {
    counts,
    total,
    successPct: total > 0 ? success / total : 0,
    capped: sheet?.capped ?? false,
    windowSize: total,
  }
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/jobs.ts src/engines/aggregation/jobs.test.ts && git commit -m "feat: add job-health engine with capped-window flag"`

---

## Task 7: Compliance engine

**Files:** Create `src/engines/aggregation/compliance.ts`, `src/engines/aggregation/compliance.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook`; `cellStr`/`countBy` from `./rows`; `Compliance` from `../../types/reportView`.
- Produces: `computeCompliance(wb): Compliance`. Reads `Copies`: `Data Consistency` (APPLICATION_CONSISTENT), `Lock Status` (immutable = anything other than `ALL_COPIES_UNLOCKED`), `Replica` (`True`), `Backup Level` mix. Percentages over the window; `capped`/`windowSize` from the sheet.

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/compliance.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { computeCompliance } from './compliance'

function wb(rows: Array<Record<string, string>>, capped = false): ParsedWorkbook {
  const sheet: SheetData = {
    name: 'Copies',
    headers: ['Data Consistency', 'Lock Status', 'Replica', 'Backup Level'],
    rows,
    capped,
  }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: { Copies: sheet },
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('computeCompliance', () => {
  it('computes consistency, immutability, replication and level mix', () => {
    const c = computeCompliance(
      wb([
        { 'Data Consistency': 'APPLICATION_CONSISTENT', 'Lock Status': 'ALL_COPIES_UNLOCKED', Replica: 'True', 'Backup Level': 'FULL' },
        { 'Data Consistency': 'APPLICATION_CONSISTENT', 'Lock Status': 'ALL_COPIES_UNLOCKED', Replica: 'False', 'Backup Level': 'LOG' },
        { 'Data Consistency': 'CRASH_CONSISTENT', 'Lock Status': 'GOVERNANCE', Replica: 'False', 'Backup Level': 'FULL' },
        { 'Data Consistency': 'CRASH_CONSISTENT', 'Lock Status': 'ALL_COPIES_UNLOCKED', Replica: 'False', 'Backup Level': 'LOG' },
      ]),
    )
    expect(c.windowSize).toBe(4)
    expect(c.appConsistentPct).toBeCloseTo(0.5, 4)
    expect(c.immutablePct).toBeCloseTo(0.25, 4) // only the GOVERNANCE copy is locked
    expect(c.replicatedPct).toBeCloseTo(0.25, 4)
    expect(c.backupLevelMix).toEqual({ FULL: 2, LOG: 2 })
  })

  it('all-unlocked copies → 0% immutable (the WHO ransomware-gap case)', () => {
    const c = computeCompliance(
      wb([
        { 'Lock Status': 'ALL_COPIES_UNLOCKED' },
        { 'Lock Status': 'ALL_COPIES_UNLOCKED' },
      ]),
    )
    expect(c.immutablePct).toBe(0)
  })

  it('is safe when Copies is absent', () => {
    const c = computeCompliance({
      meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
      sheets: {},
      inUse: [],
      idleAgents: [],
      warnings: [],
    })
    expect(c.windowSize).toBe(0)
    expect(c.appConsistentPct).toBe(0)
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/engines/aggregation/compliance.ts`

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { Compliance } from '../../types/reportView'
import { cellStr, countBy } from './rows'

/** Copy-level compliance posture over the (possibly capped) copy window. */
export function computeCompliance(wb: ParsedWorkbook): Compliance {
  const sheet = wb.sheets.Copies
  const rows = sheet?.rows ?? []
  const n = rows.length

  let appConsistent = 0
  let immutable = 0
  let replicated = 0
  for (const r of rows) {
    if (cellStr(r, 'Data Consistency') === 'APPLICATION_CONSISTENT') appConsistent++
    const lock = cellStr(r, 'Lock Status')
    if (lock !== '' && lock !== 'ALL_COPIES_UNLOCKED') immutable++
    if (cellStr(r, 'Replica').toUpperCase() === 'TRUE') replicated++
  }

  return {
    appConsistentPct: n > 0 ? appConsistent / n : 0,
    immutablePct: n > 0 ? immutable / n : 0,
    replicatedPct: n > 0 ? replicated / n : 0,
    backupLevelMix: countBy(rows, 'Backup Level'),
    windowSize: n,
    capped: sheet?.capped ?? false,
  }
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/compliance.ts src/engines/aggregation/compliance.test.ts && git commit -m "feat: add copy-compliance engine (consistency/immutability/replication)"`

---

## Task 8: Capacity engine

**Files:** Create `src/engines/aggregation/capacity.ts`, `src/engines/aggregation/capacity.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook`; `cellStr`/`cellNum` from `./rows`; `Capacity`/`StorageTarget` from `../../types/reportView`.
- Produces: `computeCapacity(wb, flagThresholdPct = 80): Capacity`. Reads `Storage Targets` (`Name`, `Type`, `Utilization (%)`) → flag when utilization ≥ threshold and the value is present. `mtreeCount` = data-row count of `Data Domain Mtrees`.

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/capacity.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { computeCapacity } from './capacity'

function sheet(name: string, headers: string[], rows: Array<Record<string, string>>): SheetData {
  return { name, headers, rows, capped: false }
}

function wb(sheets: Record<string, SheetData>): ParsedWorkbook {
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets,
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('computeCapacity', () => {
  it('reads utilization, flags targets at/over the threshold, and counts mtrees', () => {
    const cap = computeCapacity(
      wb({
        'Storage Targets': sheet('Storage Targets', ['Name', 'Type', 'Utilization (%)'], [
          { Name: 'dd1', Type: 'DATA_DOMAIN_SYSTEM', 'Utilization (%)': '87.6' },
          { Name: 'dd2', Type: 'DATA_DOMAIN_SYSTEM', 'Utilization (%)': '89.6' },
          { Name: 'arr', Type: 'GENERIC_NAS_APPLIANCE', 'Utilization (%)': 'N/A' },
        ]),
        'Data Domain Mtrees': sheet('Data Domain Mtrees', ['Name'], [{ Name: 'm1' }, { Name: 'm2' }]),
      }),
      80,
    )
    expect(cap.targets).toHaveLength(3)
    expect(cap.flagged.map((t) => t.name)).toEqual(['dd1', 'dd2'])
    expect(cap.targets[2].utilizationPct).toBe(0) // N/A → 0, not flagged
    expect(cap.flagged.every((t) => t.flagged)).toBe(true)
    expect(cap.mtreeCount).toBe(2)
  })

  it('is safe when sheets are absent', () => {
    const cap = computeCapacity(wb({}))
    expect(cap.targets).toEqual([])
    expect(cap.flagged).toEqual([])
    expect(cap.mtreeCount).toBe(0)
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/engines/aggregation/capacity.ts`

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { Capacity, StorageTarget } from '../../types/reportView'
import { cellNum, cellStr } from './rows'

/** Storage-target utilization with capacity-risk flags, plus Data Domain mtree count. */
export function computeCapacity(wb: ParsedWorkbook, flagThresholdPct = 80): Capacity {
  const rows = wb.sheets['Storage Targets']?.rows ?? []
  const targets: StorageTarget[] = rows.map((r) => {
    const utilizationPct = cellNum(r, 'Utilization (%)')
    const hasUtil = cellStr(r, 'Utilization (%)') !== ''
    return {
      name: cellStr(r, 'Name'),
      type: cellStr(r, 'Type'),
      utilizationPct,
      flagged: hasUtil && utilizationPct >= flagThresholdPct,
    }
  })
  return {
    targets,
    flagged: targets.filter((t) => t.flagged),
    mtreeCount: wb.sheets['Data Domain Mtrees']?.rows.length ?? 0,
  }
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/capacity.ts src/engines/aggregation/capacity.test.ts && git commit -m "feat: add storage-capacity engine with risk flags"`

---

## Task 9: Policies engine

**Files:** Create `src/engines/aggregation/policies.ts`, `src/engines/aggregation/policies.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook`; `cellStr`/`cellNum`/`countBy` from `./rows`; `Policies`/`PolicyRow` from `../../types/reportView`.
- Produces: `summarizePolicies(wb): Policies`. Reads `Policies` (`Name`, `Purpose`, `Number of Assets`, `Total Asset Protection Capacity (GB)`).

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/policies.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { summarizePolicies } from './policies'

function wb(rows: Array<Record<string, string>>): ParsedWorkbook {
  const sheet: SheetData = {
    name: 'Policies',
    headers: ['Name', 'Purpose', 'Number of Assets', 'Total Asset Protection Capacity (GB)'],
    rows,
    capped: false,
  }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: { Policies: sheet },
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('summarizePolicies', () => {
  it('counts policies, tallies purposes, and maps per-policy rows', () => {
    const p = summarizePolicies(
      wb([
        { Name: 'SQL - Prod', Purpose: 'CENTRALIZED', 'Number of Assets': '380', 'Total Asset Protection Capacity (GB)': '1234.5' },
        { Name: 'Exclusions', Purpose: 'EXCLUSION', 'Number of Assets': '0', 'Total Asset Protection Capacity (GB)': '0' },
      ]),
    )
    expect(p.count).toBe(2)
    expect(p.byPurpose).toEqual({ CENTRALIZED: 1, EXCLUSION: 1 })
    expect(p.perPolicy[0]).toEqual({ name: 'SQL - Prod', purpose: 'CENTRALIZED', assetCount: 380, protectionCapacityGb: 1234.5 })
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/engines/aggregation/policies.ts`

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { Policies, PolicyRow } from '../../types/reportView'
import { cellNum, cellStr, countBy } from './rows'

/** Protection-policy summary: count, purpose tally, and per-policy detail. */
export function summarizePolicies(wb: ParsedWorkbook): Policies {
  const rows = wb.sheets.Policies?.rows ?? []
  const perPolicy: PolicyRow[] = rows.map((r) => ({
    name: cellStr(r, 'Name'),
    purpose: cellStr(r, 'Purpose'),
    assetCount: cellNum(r, 'Number of Assets'),
    protectionCapacityGb: cellNum(r, 'Total Asset Protection Capacity (GB)'),
  }))
  return { count: rows.length, byPurpose: countBy(rows, 'Purpose'), perPolicy }
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/policies.ts src/engines/aggregation/policies.test.ts && git commit -m "feat: add policies summary engine"`

---

## Task 10: ReportView composition root

**Files:** Create `src/engines/aggregation/reportView.ts`, `src/engines/aggregation/reportView.test.ts`

**Interfaces:**
- Consumes: `ParsedWorkbook`; every engine above; `ReportView` from `../../types/reportView`.
- Produces: `buildReportView(wb: ParsedWorkbook): ReportView`. Pure composition — calls each engine once, passes through `meta`/`inUse`/`idleAgents`/`warnings`.

- [ ] **Step 1: Write the failing test** `src/engines/aggregation/reportView.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { buildReportView } from './reportView'

function sheet(name: string, rows: Array<Record<string, string>>): SheetData {
  return { name, headers: Object.keys(rows[0] ?? {}), rows, capped: false }
}

describe('buildReportView', () => {
  it('composes every engine result and passes through workbook metadata', () => {
    const wb: ParsedWorkbook = {
      meta: { projectId: '1', customer: 'WHO', collectorBuild: '27.2.5.278', capturedAt: '2026-06-15T00:00:00.000Z', baseTen: true },
      sheets: {
        'SQL Databases': sheet('SQL Databases', [
          { 'Protection Status': 'PROTECTED' },
          { 'Protection Status': 'UNPROTECTED' },
        ]),
        'Unprotected Assets': sheet('Unprotected Assets', [{ Name: 'x', Type: 'VM', 'Size (GB)': '10' }]),
        Policies: sheet('Policies', [{ Name: 'p', Purpose: 'CENTRALIZED', 'Number of Assets': '1' }]),
      },
      inUse: ['SQL Databases'],
      idleAgents: ['Oracle Databases'],
      warnings: ['capped: Copies'],
    }
    const view = buildReportView(wb)
    expect(view.meta.customer).toBe('WHO')
    expect(view.inUse).toEqual(['SQL Databases'])
    expect(view.idleAgents).toEqual(['Oracle Databases'])
    expect(view.warnings).toEqual(['capped: Copies'])
    expect(view.coverage.overall.protected).toBe(1)
    expect(view.gaps.count).toBe(1)
    expect(view.policies.count).toBe(1)
    expect(view.jobs.total).toBe(0) // no job sheet → safe zero
    expect(view.compliance.windowSize).toBe(0)
    expect(view.capacity.mtreeCount).toBe(0)
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/engines/aggregation/reportView.ts`

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { ReportView } from '../../types/reportView'
import { computeCapacity } from './capacity'
import { computeCompliance } from './compliance'
import { computeCoverage } from './coverage'
import { findGaps } from './gaps'
import { computeJobs } from './jobs'
import { summarizePolicies } from './policies'

/** Single composition root: ParsedWorkbook → fully derived ReportView. Pure. */
export function buildReportView(wb: ParsedWorkbook): ReportView {
  return {
    meta: wb.meta,
    inUse: wb.inUse,
    idleAgents: wb.idleAgents,
    warnings: wb.warnings,
    coverage: computeCoverage(wb),
    gaps: findGaps(wb),
    jobs: computeJobs(wb),
    compliance: computeCompliance(wb),
    capacity: computeCapacity(wb),
    policies: summarizePolicies(wb),
  }
}
```

- [ ] **Step 4:** Run the test → PASS. Then `npm run test:run` + `npm run typecheck`.
- [ ] **Step 5:** `git add src/engines/aggregation/reportView.ts src/engines/aggregation/reportView.test.ts && git commit -m "feat: add ReportView composition root"`

---

## Task 11: useReportView bridge hook

**Files:** Create `src/hooks/useReportView.ts`, `src/hooks/useReportView.test.ts`

**Interfaces:**
- Consumes: `useReportStore` (Plan 1), `buildReportView`, `ReportView`.
- Produces: `useReportView(): ReportView | null`. The ONLY `useMemo` deriving the view from the stored workbook; returns `null` when no workbook is loaded.

- [ ] **Step 1: Write the failing test** `src/hooks/useReportView.test.ts`

```ts
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../types/ppdm'
import { useReportStore } from '../store/reportStore'
import { useReportView } from './useReportView'

function sheet(name: string, rows: Array<Record<string, string>>): SheetData {
  return { name, headers: Object.keys(rows[0] ?? {}), rows, capped: false }
}

const wb: ParsedWorkbook = {
  meta: { projectId: '', customer: 'WHO', collectorBuild: '', capturedAt: '', baseTen: true },
  sheets: { 'SQL Databases': sheet('SQL Databases', [{ 'Protection Status': 'PROTECTED' }]) },
  inUse: ['SQL Databases'],
  idleAgents: [],
  warnings: [],
}

describe('useReportView', () => {
  beforeEach(() => useReportStore.getState().clear())

  it('returns null when no workbook is loaded', () => {
    const { result } = renderHook(() => useReportView())
    expect(result.current).toBeNull()
  })

  it('derives the ReportView from the stored workbook', () => {
    useReportStore.getState().setWorkbook(wb)
    const { result } = renderHook(() => useReportView())
    expect(result.current?.meta.customer).toBe('WHO')
    expect(result.current?.coverage.overall.protected).toBe(1)
  })
})
```

- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3: Write** `src/hooks/useReportView.ts`

```ts
import { useMemo } from 'react'
import { buildReportView } from '../engines/aggregation/reportView'
import { useReportStore } from '../store/reportStore'
import type { ReportView } from '../types/reportView'

/** The single derivation point: stored workbook → ReportView (null when none loaded). */
export function useReportView(): ReportView | null {
  const workbook = useReportStore((s) => s.workbook)
  return useMemo(() => (workbook ? buildReportView(workbook) : null), [workbook])
}
```

- [ ] **Step 4:** Run the test → PASS. Then run the FULL gate: `npm run test:run`, `npm run typecheck`, `rtk proxy node_modules/.bin/biome check .` (0 errors), `npm run build`, `npm run test:coverage` (≥75%).
- [ ] **Step 5:** `git add src/hooks/useReportView.ts src/hooks/useReportView.test.ts && git commit -m "feat: add useReportView bridge hook"`

---

## Self-Review (completed by author)

- **Spec §5 coverage:** coverage (both figures) ✓ T4; gaps + total capacity + topN ✓ T5/T3; jobs + capped flag ✓ T6; compliance (consistency/immutability/replication/level mix) ✓ T7; capacity + risk flags + mtrees ✓ T8; policies ✓ T9; composition root ✓ T10; bridge hook (single memo) ✓ T11. The flavor selector (ordering) and `units` branding are intentionally deferred — flavor lives in Plan 3 (UI/export ordering); branded units are YAGNI (engines return plain numbers).
- **No silent caps:** `jobs` and `compliance` both carry `capped`/`windowSize`; totals for gaps/policies/capacity come from un-capped aggregate sheets.
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** all engines import result types from `src/types/reportView.ts`; `buildReportView` returns `ReportView`; `useReportView` returns `ReportView | null`. `cellStr`/`cellNum`/`countBy` signatures stable across all consumers.

## Process notes (carried from Plan 1 review)
- Every implementer brief here already lists `lint` + `build` + `coverage` in the gate (Plan 1's lint gap won't recur).
- Run biome via `rtk proxy node_modules/.bin/biome check .` — the proxy mangles raw `npm run lint` output.

## Next: Plan 3 — Dashboard, dual-theme PPTX/HTML export, i18n (the visible product).
```
