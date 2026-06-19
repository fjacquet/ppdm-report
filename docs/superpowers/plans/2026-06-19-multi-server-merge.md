# Multi-Server Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload several Live Optics PPDM `.xlsx` exports, merge them into one estate, and produce a combined report plus a per-server breakdown — all client-side.

**Architecture:** The whole pipeline funnels through `ParsedWorkbook`, consumed by the pure `buildReportView`. A new pure `mergeWorkbooks(ServerWorkbook[]) → ParsedWorkbook` produces the combined estate; the per-server breakdown is `servers.map(buildReportView)`. No aggregation engine or export renderer is rewritten. The store moves from one `workbook` to a `servers[]` list; a new `EstateView` (`combined` + `perServer` + `multiSource`) is derived in `useReportView`.

**Tech Stack:** React 19, TypeScript 5, Zustand, Vite 6, Vitest + Testing Library, SheetJS (`xlsx`), ECharts, pptxgenjs, react-i18next (en/de/fr/it).

## Global Constraints

- 100% client-side; the workbook never leaves the browser (ADR 0001). Never add a network call.
- Sole input is the Live Optics PPDM `.xlsx` export (ADR 0002, being amended here).
- "No silent caps" (ADR 0004): every data caveat surfaces as a warning. **Always warn, never block.**
- Single customer across all servers by design: `meta.customer` is the shared value (take the first).
- Server label source of truth: PPDM appliance **Host Name** (`System Information` sheet) → Project Name (`meta.customer`) → filename.
- Typeface is Arial everywhere (`fontFamily: 'Arial, Helvetica, sans-serif'`).
- i18n: any new UI string key MUST be added to all four locales (`en`, `de`, `fr`, `it`) in the same step — `src/i18n/keyParity.test.ts` enforces parity.
- KISS / DRY / YAGNI / FP: reuse `buildReportView`; do not duplicate metric logic.
- TDD: write the failing test first; commit after each green step. Run the full suite with `npm test -- --run`; a single file with `npm test -- --run <path>`.
- Lint/format with Biome: `npx biome check --write <paths>` before each commit.
- Type-check with `npm run typecheck` (= `tsc --noEmit && tsc --noEmit -p tsconfig.test.json`) — this is what CI runs, and it checks BOTH source and test files. Note `tsconfig.test.json` has `noUncheckedIndexedAccess`, so in tests guard indexed access: `rows[0] ? Object.keys(rows[0]) : []`, and read possibly-absent map entries with optional chaining (`merged.sheets.Copies?.rows`) — Biome forbids `!` non-null assertions.

---

## File Structure

**New files:**
- `src/engines/parser/deriveLabel.ts` — System Information readers + label derivation + collision suffixing.
- `src/engines/parser/deriveLabel.test.ts`
- `src/engines/parser/mergeWorkbooks.ts` — pure N-workbook merge + merge warnings.
- `src/engines/parser/mergeWorkbooks.test.ts`
- `src/components/ServerList.tsx` — loaded-servers chip strip with remove / clear-all.
- `src/components/ServerList.test.tsx`
- `src/components/dashboard/WarningsBanner.tsx` — surfaces `view.warnings`.
- `src/components/dashboard/WarningsBanner.test.tsx`
- `src/components/dashboard/PerServerSection.tsx` — per-server comparison (chart + table).
- `src/components/dashboard/PerServerSection.test.tsx`
- `docs/adr/0009-estate-merge-model.md` — new ADR.

**Modified files:**
- `src/types/ppdm.ts` — add `ServerWorkbook`.
- `src/types/reportView.ts` — add `ServerView`, `EstateView`.
- `src/store/reportStore.ts` (+ test) — `servers[]` with `addServers`/`removeServer`/`clear`.
- `src/hooks/useReportUpload.ts` — parse → label → append (multi-file in Task 5).
- `src/hooks/useReportView.ts` (+ test) — return `EstateView | null`.
- `src/App.tsx` — consume `EstateView`; render `ServerList`; pass `combined`/`perServer` down.
- `src/components/UploadZone.tsx` (+ test) — multi-file intake.
- `src/components/dashboard/Dashboard.tsx` (+ test) — render `WarningsBanner` + `PerServerSection`.
- `src/components/ExportButtons.tsx` — accept `EstateView`.
- `src/hooks/useExport.ts` — accept `EstateView`, pass `perServer`.
- `src/engines/export/sectionOrder.ts` — add `'perServer'` `SectionId`.
- `src/engines/export/types.ts` — add `ExportModel.warnings`.
- `src/engines/export/buildExportModel.ts` (+ test) — `perServer` section + `warnings`.
- `src/engines/export/html/assembleHtml.ts` (+ test) — render `warnings`.
- `src/engines/export/pptx/builder.ts` — render `warnings` on title slide.
- `src/i18n/locales/{en,de,fr,it}/common.json` — `servers.*`, `warnings.title`.
- `src/i18n/locales/{en,de,fr,it}/dashboard.json` — `perServer.*`.
- `docs/adr/0002-xlsx-input-model.md`, `README.md`, `docs/USER-GUIDE.md`.

---

## Task 1: Label helpers + `ServerWorkbook` type

**Files:**
- Create: `src/engines/parser/deriveLabel.ts`
- Test: `src/engines/parser/deriveLabel.test.ts`
- Modify: `src/types/ppdm.ts` (append after `ParsedWorkbook`)

**Interfaces:**
- Consumes: `ParsedWorkbook`, `Cell` from `src/types/ppdm.ts`.
- Produces:
  - `interface ServerWorkbook { label: string; workbook: ParsedWorkbook }`
  - `appHostName(wb: ParsedWorkbook): string` — `''` when absent.
  - `appVersion(wb: ParsedWorkbook): string` — `''` when absent.
  - `deriveLabel(wb: ParsedWorkbook, filename: string): string`
  - `withUniqueLabel(existing: string[], base: string): string`

- [ ] **Step 1: Add the `ServerWorkbook` type**

In `src/types/ppdm.ts`, append after the `ParsedWorkbook` interface (after line 35):

```ts
/** A parsed workbook tagged with a human-readable source-server label. */
export interface ServerWorkbook {
  label: string
  workbook: ParsedWorkbook
}
```

- [ ] **Step 2: Write the failing test**

Create `src/engines/parser/deriveLabel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { appHostName, appVersion, deriveLabel, withUniqueLabel } from './deriveLabel'

function wbWith(sysRow: Record<string, string> | null, customer = ''): ParsedWorkbook {
  const sheets: Record<string, SheetData> = {}
  if (sysRow) {
    sheets['System Information'] = {
      name: 'System Information',
      headers: Object.keys(sysRow),
      rows: [sysRow],
      capped: false,
    }
  }
  return {
    meta: { projectId: '', customer, collectorBuild: '', capturedAt: '', baseTen: true },
    sheets,
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('deriveLabel helpers', () => {
  it('reads the appliance host name', () => {
    expect(appHostName(wbWith({ 'Host Name': 'ppdm-paris', 'PowerProtect Version': '19.22' }))).toBe(
      'ppdm-paris',
    )
  })

  it('reads the PowerProtect version', () => {
    expect(appVersion(wbWith({ 'Host Name': 'x', 'PowerProtect Version': '19.22.0-16' }))).toBe(
      '19.22.0-16',
    )
  })

  it('returns empty string when System Information is missing', () => {
    expect(appHostName(wbWith(null))).toBe('')
    expect(appVersion(wbWith(null))).toBe('')
  })

  it('derives label from host name first', () => {
    expect(deriveLabel(wbWith({ 'Host Name': 'ppdm-paris' }, 'ACME'), 'paris.xlsx')).toBe(
      'ppdm-paris',
    )
  })

  it('falls back to customer, then filename', () => {
    expect(deriveLabel(wbWith(null, 'ACME'), 'paris.xlsx')).toBe('ACME')
    expect(deriveLabel(wbWith(null, ''), 'paris.xlsx')).toBe('paris')
  })

  it('suffixes colliding labels', () => {
    expect(withUniqueLabel([], 'ppdm')).toBe('ppdm')
    expect(withUniqueLabel(['ppdm'], 'ppdm')).toBe('ppdm (2)')
    expect(withUniqueLabel(['ppdm', 'ppdm (2)'], 'ppdm')).toBe('ppdm (3)')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --run src/engines/parser/deriveLabel.test.ts`
Expected: FAIL — `Failed to resolve import "./deriveLabel"`.

- [ ] **Step 4: Implement `deriveLabel.ts`**

Create `src/engines/parser/deriveLabel.ts`:

```ts
import type { Cell, ParsedWorkbook } from '../../types/ppdm'

/** First data row of the single-row "System Information" sheet, if present. */
function systemInfoRow(wb: ParsedWorkbook): Record<string, Cell> | undefined {
  return wb.sheets['System Information']?.rows[0]
}

function field(wb: ParsedWorkbook, key: string): string {
  const v = systemInfoRow(wb)?.[key]
  return v === null || v === undefined ? '' : String(v).trim()
}

/** PPDM appliance host name from System Information; '' when absent. */
export function appHostName(wb: ParsedWorkbook): string {
  return field(wb, 'Host Name')
}

/** PowerProtect (PPDM) version from System Information; '' when absent. */
export function appVersion(wb: ParsedWorkbook): string {
  return field(wb, 'PowerProtect Version')
}

/** A server's display label: appliance host name → Project Name → filename. */
export function deriveLabel(wb: ParsedWorkbook, filename: string): string {
  const host = appHostName(wb)
  if (host) return host
  if (wb.meta.customer) return wb.meta.customer
  return filename.replace(/\.xlsx$/i, '')
}

/** Make `base` unique against `existing` by appending " (2)", " (3)", … */
export function withUniqueLabel(existing: string[], base: string): string {
  if (!existing.includes(base)) return base
  let i = 2
  while (existing.includes(`${base} (${i})`)) i++
  return `${base} (${i})`
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- --run src/engines/parser/deriveLabel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Lint, type-check, commit**

```bash
npx biome check --write src/engines/parser/deriveLabel.ts src/engines/parser/deriveLabel.test.ts src/types/ppdm.ts
npx tsc -p tsconfig.app.json --noEmit
git add src/engines/parser/deriveLabel.ts src/engines/parser/deriveLabel.test.ts src/types/ppdm.ts
git commit -m "feat(parser): server label helpers + ServerWorkbook type"
```

---

## Task 2: `mergeWorkbooks` — sheets, meta, classification

**Files:**
- Create: `src/engines/parser/mergeWorkbooks.ts`
- Test: `src/engines/parser/mergeWorkbooks.test.ts`

**Interfaces:**
- Consumes: `ServerWorkbook`, `ParsedWorkbook`, `SheetData`, `CaptureMeta`, `LIVE_OPTICS_ROW_CAP` from `src/types/ppdm.ts`; `classifyAgents` from `./detectInUse`; `appHostName` from `./deriveLabel`; `buildReportView` from `../aggregation/reportView` (test only).
- Produces: `mergeWorkbooks(servers: ServerWorkbook[]): ParsedWorkbook`. Warnings beyond the single-source identity are added in Task 3 (this task ships an empty `warnings` array for multi-source).

- [ ] **Step 1: Write the failing test (single-source identity invariant)**

Create `src/engines/parser/mergeWorkbooks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildReportView } from '../aggregation/reportView'
import type { ParsedWorkbook, ServerWorkbook, SheetData } from '../../types/ppdm'
import { mergeWorkbooks } from './mergeWorkbooks'

function sheet(name: string, rows: Record<string, string | number>[], capped = false): SheetData {
  const headers = rows.length ? Object.keys(rows[0]) : []
  return { name, headers, rows, capped }
}

function wb(over: Partial<ParsedWorkbook> = {}): ParsedWorkbook {
  return {
    meta: { projectId: 'p1', customer: 'ACME', collectorBuild: 'b1', capturedAt: '2026-01-01', baseTen: true },
    sheets: {},
    inUse: [],
    idleAgents: [],
    warnings: [],
    ...over,
  }
}

const srv = (label: string, workbook: ParsedWorkbook): ServerWorkbook => ({ label, workbook })

describe('mergeWorkbooks — single source', () => {
  it('is an identity for one server (view is unchanged)', () => {
    const only = wb({
      sheets: { 'Storage Targets': sheet('Storage Targets', [{ Name: 'dd1', 'Utilization (%)': 80 }]) },
    })
    const merged = mergeWorkbooks([srv('a', only)])
    expect(buildReportView(merged)).toEqual(buildReportView(only))
  })
})

describe('mergeWorkbooks — multiple sources', () => {
  it('concatenates rows, unions headers, ORs the capped flag', () => {
    const a = wb({ sheets: { Copies: sheet('Copies', [{ A: 1 }], true) } })
    const b = wb({ sheets: { Copies: sheet('Copies', [{ A: 2, B: 3 }], false) } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.sheets.Copies.rows).toEqual([{ A: 1 }, { A: 2, B: 3 }])
    expect(merged.sheets.Copies.headers).toEqual(['A', 'B'])
    expect(merged.sheets.Copies.capped).toBe(true)
  })

  it('unions sheet names across sources', () => {
    const a = wb({ sheets: { Policies: sheet('Policies', [{ Name: 'x' }]) } })
    const b = wb({ sheets: { 'Storage Targets': sheet('Storage Targets', [{ Name: 'dd' }]) } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(Object.keys(merged.sheets).sort()).toEqual(['Policies', 'Storage Targets'])
  })

  it('re-derives inUse: idle on A + in-use on B → in-use', () => {
    const idle = sheet('Oracle Databases', [{ Name: 'N/A' }])
    const live = sheet('Oracle Databases', [{ Name: 'realdb' }])
    const merged = mergeWorkbooks([srv('a', wb({ sheets: { 'Oracle Databases': idle } })), srv('b', wb({ sheets: { 'Oracle Databases': live } }))])
    expect(merged.inUse).toContain('Oracle Databases')
    expect(merged.idleAgents).not.toContain('Oracle Databases')
  })

  it('folds meta: first customer, latest capturedAt, uniform baseTen', () => {
    const a = wb({ meta: { projectId: 'p1', customer: 'ACME', collectorBuild: 'b1', capturedAt: '2026-01-01', baseTen: true } })
    const b = wb({ meta: { projectId: 'p2', customer: 'ACME', collectorBuild: 'b2', capturedAt: '2026-03-09', baseTen: true } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.meta.customer).toBe('ACME')
    expect(merged.meta.capturedAt).toBe('2026-03-09')
    expect(merged.meta.baseTen).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/engines/parser/mergeWorkbooks.test.ts`
Expected: FAIL — `Failed to resolve import "./mergeWorkbooks"`.

- [ ] **Step 3: Implement `mergeWorkbooks.ts` (core; warnings stubbed empty)**

Create `src/engines/parser/mergeWorkbooks.ts`:

```ts
import type { CaptureMeta, ParsedWorkbook, ServerWorkbook, SheetData } from '../../types/ppdm'
import { classifyAgents } from './detectInUse'

/** Fold N parsed PPDM workbooks into one estate workbook. Pure.
 * Single source returns that workbook unchanged (identity). */
export function mergeWorkbooks(servers: ServerWorkbook[]): ParsedWorkbook {
  if (servers.length === 1) return servers[0].workbook

  const workbooks = servers.map((s) => s.workbook)

  const sheetNames: string[] = []
  for (const w of workbooks) {
    for (const name of Object.keys(w.sheets)) {
      if (!sheetNames.includes(name)) sheetNames.push(name)
    }
  }

  const sheets: Record<string, SheetData> = {}
  for (const name of sheetNames) {
    const present = workbooks
      .map((w) => w.sheets[name])
      .filter((s): s is SheetData => s !== undefined)
    const headers: string[] = []
    for (const s of present) {
      for (const h of s.headers) if (!headers.includes(h)) headers.push(h)
    }
    sheets[name] = {
      name,
      headers,
      rows: present.flatMap((s) => s.rows),
      capped: present.some((s) => s.capped),
    }
  }

  const { inUse, idleAgents } = classifyAgents(Object.values(sheets))

  const metas = workbooks.map((w) => w.meta)
  const dates = metas.map((m) => m.capturedAt).filter(Boolean).sort()
  const meta: CaptureMeta = {
    projectId: metas[0].projectId,
    customer: metas[0].customer,
    collectorBuild: metas[0].collectorBuild,
    capturedAt: dates.at(-1) ?? '',
    baseTen: metas.every((m) => m.baseTen)
      ? true
      : metas.every((m) => !m.baseTen)
        ? false
        : metas[0].baseTen,
  }

  return { meta, sheets, inUse, idleAgents, warnings: [] }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/engines/parser/mergeWorkbooks.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint, type-check, commit**

```bash
npx biome check --write src/engines/parser/mergeWorkbooks.ts src/engines/parser/mergeWorkbooks.test.ts
npx tsc -p tsconfig.app.json --noEmit
git add src/engines/parser/mergeWorkbooks.ts src/engines/parser/mergeWorkbooks.test.ts
git commit -m "feat(parser): mergeWorkbooks core (sheets, meta, classification)"
```

---

## Task 3: `mergeWorkbooks` — merge warnings

**Files:**
- Modify: `src/engines/parser/mergeWorkbooks.ts`
- Test: `src/engines/parser/mergeWorkbooks.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `appHostName` from `./deriveLabel`; `LIVE_OPTICS_ROW_CAP` from `src/types/ppdm.ts`.
- Produces: multi-source `warnings: string[]` containing — label-prefixed source warnings; a unit-mismatch note; duplicate-source notes; a blended-window note.

- [ ] **Step 1: Write the failing test**

Append to `src/engines/parser/mergeWorkbooks.test.ts`:

```ts
describe('mergeWorkbooks — warnings', () => {
  it('prefixes carried-over source warnings with the label', () => {
    const a = wb({ warnings: ['Sheet "Copies" reached the cap'] })
    const merged = mergeWorkbooks([srv('ppdm-a', a), srv('ppdm-b', wb())])
    expect(merged.warnings).toContain('[ppdm-a] Sheet "Copies" reached the cap')
  })

  it('warns on base-10 / base-2 unit mismatch', () => {
    const a = wb({ meta: { ...wb().meta, baseTen: true } })
    const b = wb({ meta: { ...wb().meta, baseTen: false } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.warnings.some((w) => /base-10 and base-2/.test(w))).toBe(true)
  })

  it('warns when two files report the same appliance host', () => {
    const sys = { 'System Information': sheet('System Information', [{ 'Host Name': 'ppdm.who.int' }]) }
    const merged = mergeWorkbooks([
      srv('first', wb({ sheets: { ...sys } })),
      srv('second', wb({ sheets: { ...sys } })),
    ])
    expect(merged.warnings.some((w) => /double-counted/.test(w))).toBe(true)
  })

  it('warns when a sheet is capped in 2+ sources (blended window)', () => {
    const a = wb({ sheets: { Copies: sheet('Copies', [{ A: 1 }], true) } })
    const b = wb({ sheets: { Copies: sheet('Copies', [{ A: 2 }], true) } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.warnings.some((w) => /blend independent windows/.test(w))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/engines/parser/mergeWorkbooks.test.ts`
Expected: FAIL — the new assertions fail (warnings is `[]`).

- [ ] **Step 3: Implement the warnings builder**

In `src/engines/parser/mergeWorkbooks.ts`, update the imports line and replace the final `return` of `mergeWorkbooks` with a call to a new `mergeWarnings`, then add the function.

Change the import block at the top to:

```ts
import type { CaptureMeta, ParsedWorkbook, ServerWorkbook, SheetData } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'
import { appHostName } from './deriveLabel'
import { classifyAgents } from './detectInUse'
```

Replace the final return statement:

```ts
  return { meta, sheets, inUse, idleAgents, warnings: [] }
```

with:

```ts
  return { meta, sheets, inUse, idleAgents, warnings: mergeWarnings(servers) }
```

Append this function to the file:

```ts
/** Estate-level data caveats (always warn, never block). */
function mergeWarnings(servers: ServerWorkbook[]): string[] {
  const out: string[] = []

  // 1. Carry over each source warning, attributed to its server.
  for (const s of servers) {
    for (const w of s.workbook.warnings) out.push(`[${s.label}] ${w}`)
  }

  // 2. Unit mismatch — base-10 vs base-2.
  const bases = new Set(servers.map((s) => s.workbook.meta.baseTen))
  if (bases.size > 1) {
    out.push(
      'Source exports mix base-10 and base-2 units; combined capacity figures span different measurement scales.',
    )
  }

  // 3. Duplicate suspicion — same appliance host, else same project+snapshot.
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

  // 4. Blended window — a sheet capped in 2+ sources.
  const names = new Set(servers.flatMap((s) => Object.keys(s.workbook.sheets)))
  const multiCapped = [...names].some(
    (name) => servers.filter((s) => s.workbook.sheets[name]?.capped).length >= 2,
  )
  if (multiCapped) {
    out.push(
      `One or more sheets reached the ${LIVE_OPTICS_ROW_CAP.toLocaleString()}-row cap in multiple source servers; combined figures from them blend independent windows, not the full set.`,
    )
  }

  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/engines/parser/mergeWorkbooks.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Lint, type-check, commit**

```bash
npx biome check --write src/engines/parser/mergeWorkbooks.ts src/engines/parser/mergeWorkbooks.test.ts
npx tsc -p tsconfig.app.json --noEmit
git add src/engines/parser/mergeWorkbooks.ts src/engines/parser/mergeWorkbooks.test.ts
git commit -m "feat(parser): estate merge warnings (units, duplicates, blended windows)"
```

---

## Task 4: Estate plumbing — store, upload, derivation, App wiring

This task flips the data layer from a single workbook to a `servers[]` estate and rewires `App` to consume `EstateView`. Behavior for a single file is unchanged. The breakdown UI and export changes come later (purely additive).

**Files:**
- Modify: `src/types/reportView.ts`, `src/store/reportStore.ts`, `src/store/reportStore.test.ts`, `src/hooks/useReportUpload.ts`, `src/hooks/useReportView.ts`, `src/hooks/useReportView.test.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: `mergeWorkbooks` (Task 2/3), `deriveLabel`/`withUniqueLabel` (Task 1), `buildReportView`, `appVersion` (Task 1).
- Produces:
  - `interface ServerView { label: string; version: string; view: ReportView }`
  - `interface EstateView { combined: ReportView; perServer: ServerView[]; multiSource: boolean }`
  - store: `servers: ServerWorkbook[]`, `addServers(s: ServerWorkbook[])`, `removeServer(label: string)`, `clear()`, plus existing `flavor`/`setFlavor`.
  - `useReportView(): EstateView | null`
  - `useReportUpload().upload(file: File): Promise<void>` (unchanged signature; now appends).

- [ ] **Step 1: Add `ServerView` + `EstateView` types**

In `src/types/reportView.ts`, append after the `ReportView` interface:

```ts
/** One source server's report plus identity, for the per-server breakdown. */
export interface ServerView {
  label: string
  /** PowerProtect version from System Information; '' when absent. */
  version: string
  view: ReportView
}

/** The whole estate: combined headline + per-server breakdown. */
export interface EstateView {
  combined: ReportView
  perServer: ServerView[]
  multiSource: boolean
}
```

- [ ] **Step 2: Rewrite the store test (failing)**

Replace the body of `src/store/reportStore.test.ts` with:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { ParsedWorkbook, ServerWorkbook } from '../types/ppdm'
import { useReportStore } from './reportStore'

function wb(customer: string): ParsedWorkbook {
  return {
    meta: { projectId: '', customer, collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: {},
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}
const srv = (label: string, customer = label): ServerWorkbook => ({ label, workbook: wb(customer) })

describe('reportStore', () => {
  beforeEach(() => useReportStore.getState().clear())

  it('starts empty', () => {
    expect(useReportStore.getState().servers).toEqual([])
  })

  it('appends servers (does not replace)', () => {
    useReportStore.getState().addServers([srv('a')])
    useReportStore.getState().addServers([srv('b')])
    expect(useReportStore.getState().servers.map((s) => s.label)).toEqual(['a', 'b'])
  })

  it('suffixes colliding labels on add', () => {
    useReportStore.getState().addServers([srv('ppdm'), srv('ppdm')])
    expect(useReportStore.getState().servers.map((s) => s.label)).toEqual(['ppdm', 'ppdm (2)'])
  })

  it('removes a server by label', () => {
    useReportStore.getState().addServers([srv('a'), srv('b')])
    useReportStore.getState().removeServer('a')
    expect(useReportStore.getState().servers.map((s) => s.label)).toEqual(['b'])
  })

  it('clear empties the list', () => {
    useReportStore.getState().addServers([srv('a')])
    useReportStore.getState().clear()
    expect(useReportStore.getState().servers).toEqual([])
  })

  it('starts with assessment flavor and setFlavor updates it', () => {
    expect(useReportStore.getState().flavor).toBe('assessment')
    useReportStore.getState().setFlavor('ops')
    expect(useReportStore.getState().flavor).toBe('ops')
    useReportStore.getState().setFlavor('assessment')
  })
})
```

Run: `npm test -- --run src/store/reportStore.test.ts`
Expected: FAIL — `servers`/`addServers` do not exist.

- [ ] **Step 3: Rewrite the store**

Replace the entire contents of `src/store/reportStore.ts`:

```ts
import { create } from 'zustand'
import { withUniqueLabel } from '../engines/parser/deriveLabel'
import type { ServerWorkbook } from '../types/ppdm'

export type Flavor = 'assessment' | 'ops'

interface ReportState {
  servers: ServerWorkbook[]
  flavor: Flavor
  addServers: (incoming: ServerWorkbook[]) => void
  removeServer: (label: string) => void
  setFlavor: (flavor: Flavor) => void
  clear: () => void
}

export const useReportStore = create<ReportState>((set) => ({
  servers: [],
  flavor: 'assessment',
  addServers: (incoming) =>
    set((state) => {
      const labels = state.servers.map((s) => s.label)
      const added: ServerWorkbook[] = []
      for (const s of incoming) {
        const label = withUniqueLabel([...labels, ...added.map((a) => a.label)], s.label)
        added.push({ label, workbook: s.workbook })
      }
      return { servers: [...state.servers, ...added] }
    }),
  removeServer: (label) =>
    set((state) => ({ servers: state.servers.filter((s) => s.label !== label) })),
  setFlavor: (flavor) => set({ flavor }),
  clear: () => set({ servers: [] }),
}))
```

Run: `npm test -- --run src/store/reportStore.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 4: Write the failing `useReportView` test**

Replace the contents of `src/hooks/useReportView.test.ts` with:

```ts
import { renderHook } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import type { ParsedWorkbook, ServerWorkbook, SheetData } from '../types/ppdm'
import { useReportStore } from '../store/reportStore'
import { useReportView } from './useReportView'

function sheet(name: string, rows: Record<string, string | number>[]): SheetData {
  return { name, headers: rows.length ? Object.keys(rows[0]) : [], rows, capped: false }
}
function wb(customer: string, sys?: Record<string, string>): ParsedWorkbook {
  const sheets: Record<string, SheetData> = {}
  if (sys) sheets['System Information'] = sheet('System Information', [sys])
  return {
    meta: { projectId: '', customer, collectorBuild: '', capturedAt: '', baseTen: true },
    sheets,
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}
const srv = (label: string, workbook: ParsedWorkbook): ServerWorkbook => ({ label, workbook })

describe('useReportView', () => {
  beforeEach(() => useReportStore.getState().clear())

  it('returns null with no servers', () => {
    const { result } = renderHook(() => useReportView())
    expect(result.current).toBeNull()
  })

  it('single server: combined present, multiSource false, perServer length 1', () => {
    useReportStore.getState().addServers([srv('a', wb('ACME', { 'PowerProtect Version': '19.22' }))])
    const { result } = renderHook(() => useReportView())
    expect(result.current?.multiSource).toBe(false)
    expect(result.current?.perServer).toHaveLength(1)
    expect(result.current?.perServer[0].version).toBe('19.22')
    expect(result.current?.combined.meta.customer).toBe('ACME')
  })

  it('two servers: multiSource true, perServer length 2', () => {
    useReportStore.getState().addServers([srv('a', wb('ACME')), srv('b', wb('ACME'))])
    const { result } = renderHook(() => useReportView())
    expect(result.current?.multiSource).toBe(true)
    expect(result.current?.perServer.map((p) => p.label)).toEqual(['a', 'b'])
  })
})
```

Run: `npm test -- --run src/hooks/useReportView.test.ts`
Expected: FAIL — `useReportView` still returns `ReportView | null` from the old store field.

- [ ] **Step 5: Rewrite `useReportView`**

Replace the contents of `src/hooks/useReportView.ts`:

```ts
import { useMemo } from 'react'
import { appVersion } from '../engines/parser/deriveLabel'
import { mergeWorkbooks } from '../engines/parser/mergeWorkbooks'
import { buildReportView } from '../engines/aggregation/reportView'
import { useReportStore } from '../store/reportStore'
import type { EstateView } from '../types/reportView'

/** The single derivation point: stored servers → EstateView (null when none loaded). */
export function useReportView(): EstateView | null {
  const servers = useReportStore((s) => s.servers)
  return useMemo(() => {
    if (servers.length === 0) return null
    return {
      combined: buildReportView(mergeWorkbooks(servers)),
      perServer: servers.map((s) => ({
        label: s.label,
        version: appVersion(s.workbook),
        view: buildReportView(s.workbook),
      })),
      multiSource: servers.length > 1,
    }
  }, [servers])
}
```

Run: `npm test -- --run src/hooks/useReportView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Update `useReportUpload` to label + append**

Replace the contents of `src/hooks/useReportUpload.ts`:

```ts
import { useState } from 'react'
import { deriveLabel } from '../engines/parser/deriveLabel'
import { parseInWorker } from '../engines/parser/parseInWorker'
import { useReportStore } from '../store/reportStore'

export function useReportUpload() {
  const addServers = useReportStore((s) => s.addServers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const workbook = await parseInWorker(file)
      addServers([{ label: deriveLabel(workbook, file.name), workbook }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return { upload, busy, error }
}
```

- [ ] **Step 7: Update `App` to consume `EstateView`**

In `src/App.tsx`, the `view` variable is now an `EstateView | null`. Update the `<main>` block and the `ExportButtons` usage. Replace line 34 (`<ExportButtons view={view} />`) with:

```tsx
          <ExportButtons view={view?.combined ?? null} />
```

Replace the `<main>` block (lines 37-40) with:

```tsx
      <main className="space-y-6 p-6">
        <UploadZone />
        {view && <Dashboard view={view.combined} />}
      </main>
```

(`Dashboard` and `ExportButtons` still take `ReportView`; they are widened in Tasks 7 and 8. `ServerList` is added in Task 5.)

- [ ] **Step 8: Run the full suite + type-check**

Run: `npm test -- --run`
Expected: PASS — all existing tests green (single-file behavior unchanged via the identity merge).
Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 9: Lint and commit**

```bash
npx biome check --write src/types/reportView.ts src/store/reportStore.ts src/store/reportStore.test.ts src/hooks/useReportUpload.ts src/hooks/useReportView.ts src/hooks/useReportView.test.ts src/App.tsx
git add src/types/reportView.ts src/store/reportStore.ts src/store/reportStore.test.ts src/hooks/useReportUpload.ts src/hooks/useReportView.ts src/hooks/useReportView.test.ts src/App.tsx
git commit -m "feat(estate): servers[] store + EstateView derivation, single-file unchanged"
```

---

## Task 5: Multi-file upload + ServerList management

**Files:**
- Modify: `src/hooks/useReportUpload.ts`, `src/components/UploadZone.tsx`, `src/components/UploadZone.test.tsx`, `src/App.tsx`
- Create: `src/components/ServerList.tsx`, `src/components/ServerList.test.tsx`
- Modify: `src/i18n/locales/{en,de,fr,it}/common.json`

**Interfaces:**
- Consumes: `useReportStore` (`servers`, `removeServer`, `clear`), `useReportUpload`.
- Produces: `upload(files: File[]): Promise<void>`; `<ServerList />` component (no props; reads the store).

- [ ] **Step 1: Add i18n keys to all four locales**

In `src/i18n/locales/en/common.json`, add after the `"upload"` block:

```json
  "servers": {
    "title": "Loaded servers",
    "clearAll": "Clear all",
    "remove": "Remove {{label}}"
  },
```

In `src/i18n/locales/fr/common.json`:

```json
  "servers": {
    "title": "Serveurs chargés",
    "clearAll": "Tout effacer",
    "remove": "Supprimer {{label}}"
  },
```

In `src/i18n/locales/de/common.json`:

```json
  "servers": {
    "title": "Geladene Server",
    "clearAll": "Alle entfernen",
    "remove": "{{label}} entfernen"
  },
```

In `src/i18n/locales/it/common.json`:

```json
  "servers": {
    "title": "Server caricati",
    "clearAll": "Cancella tutto",
    "remove": "Rimuovi {{label}}"
  },
```

Run: `npm test -- --run src/i18n/keyParity.test.ts`
Expected: PASS (keys parity holds across locales).

- [ ] **Step 2: Write the failing ServerList test**

Create `src/components/ServerList.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import type { ParsedWorkbook } from '../types/ppdm'
import { useReportStore } from '../store/reportStore'
import { ServerList } from './ServerList'

const wb: ParsedWorkbook = {
  meta: { projectId: '', customer: 'ACME', collectorBuild: '', capturedAt: '2026-03-09', baseTen: true },
  sheets: {},
  inUse: [],
  idleAgents: [],
  warnings: [],
}

describe('ServerList', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useReportStore.getState().clear()
  })
  afterEach(() => cleanup())

  it('renders nothing when empty', () => {
    const { container } = render(<ServerList />)
    expect(container.firstChild).toBeNull()
  })

  it('lists loaded server labels', () => {
    useReportStore.getState().addServers([{ label: 'ppdm-paris', workbook: wb }])
    render(<ServerList />)
    expect(screen.getByText('ppdm-paris')).toBeInTheDocument()
  })

  it('removes a server when its remove button is clicked', () => {
    useReportStore.getState().addServers([{ label: 'ppdm-paris', workbook: wb }])
    render(<ServerList />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove ppdm-paris' }))
    expect(useReportStore.getState().servers).toHaveLength(0)
  })

  it('clears all servers', () => {
    useReportStore.getState().addServers([{ label: 'a', workbook: wb }, { label: 'b', workbook: wb }])
    render(<ServerList />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(useReportStore.getState().servers).toHaveLength(0)
  })
})
```

Run: `npm test -- --run src/components/ServerList.test.tsx`
Expected: FAIL — `Failed to resolve import "./ServerList"`.

- [ ] **Step 3: Implement `ServerList`**

Create `src/components/ServerList.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { useReportStore } from '../store/reportStore'
import { fmtDate } from '../utils/format'

/** Chip strip of loaded source servers, with per-server remove and clear-all. */
export function ServerList() {
  const { t, i18n } = useTranslation('common')
  const servers = useReportStore((s) => s.servers)
  const removeServer = useReportStore((s) => s.removeServer)
  const clear = useReportStore((s) => s.clear)
  if (servers.length === 0) return null

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          {t('servers.title')} ({servers.length})
        </p>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {t('servers.clearAll')}
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {servers.map((s) => {
          const captured = fmtDate(s.workbook.meta.capturedAt.slice(0, 10), i18n.language)
          return (
            <li
              key={s.label}
              className="flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="font-medium">{s.label}</span>
              {captured !== '—' && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{captured}</span>
              )}
              <button
                type="button"
                aria-label={t('servers.remove', { label: s.label })}
                onClick={() => removeServer(s.label)}
                className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

Run: `npm test -- --run src/components/ServerList.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 4: Update `upload` to accept multiple files (failing test first)**

Replace the contents of `src/components/UploadZone.test.tsx`:

```tsx
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }))
vi.mock('../hooks/useReportUpload', () => ({
  useReportUpload: () => ({ upload: uploadMock, busy: false, error: null }),
}))

import { UploadZone } from './UploadZone'

describe('UploadZone', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    uploadMock.mockClear()
  })
  afterEach(() => cleanup())

  it('uploads all dropped .xlsx files, ignoring non-xlsx', () => {
    const { container } = render(<UploadZone />)
    const zone = container.firstChild as HTMLElement
    const a = new File(['x'], 'paris.xlsx')
    const b = new File(['x'], 'lyon.xlsx')
    const c = new File(['x'], 'notes.txt')
    fireEvent.drop(zone, { dataTransfer: { files: [a, b, c] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const passed = uploadMock.mock.calls[0]?.[0] as File[]
    expect(passed.map((f) => f.name)).toEqual(['paris.xlsx', 'lyon.xlsx'])
  })

  it('does not call upload when no .xlsx is present', () => {
    const { container } = render(<UploadZone />)
    const zone = container.firstChild as HTMLElement
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'notes.txt')] } })
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('uploads files chosen via the input', () => {
    render(<UploadZone />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'PPDM.xlsx')] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })
})
```

Run: `npm test -- --run src/components/UploadZone.test.tsx`
Expected: FAIL — current `UploadZone` calls `upload(file)` with a single File, not an array.

- [ ] **Step 5: Implement multi-file `upload` and `UploadZone`**

In `src/hooks/useReportUpload.ts`, change the `upload` function to accept and process an array (parse files independently; one failure does not sink the batch):

```ts
import { useState } from 'react'
import { deriveLabel } from '../engines/parser/deriveLabel'
import { parseInWorker } from '../engines/parser/parseInWorker'
import { useReportStore } from '../store/reportStore'
import type { ServerWorkbook } from '../types/ppdm'

export function useReportUpload() {
  const addServers = useReportStore((s) => s.addServers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(files: File[]): Promise<void> {
    setBusy(true)
    setError(null)
    const ready: ServerWorkbook[] = []
    const failed: string[] = []
    for (const file of files) {
      try {
        const workbook = await parseInWorker(file)
        ready.push({ label: deriveLabel(workbook, file.name), workbook })
      } catch {
        failed.push(file.name)
      }
    }
    if (ready.length > 0) addServers(ready)
    if (failed.length > 0) setError(`Could not parse: ${failed.join(', ')}`)
    setBusy(false)
  }

  return { upload, busy, error }
}
```

In `src/components/UploadZone.tsx`, change `handleFile` to handle a `FileList` of multiple files and add the `multiple` attribute. Replace `handleFile`, `onChange`, `onDrop`, and the `<input>`:

```tsx
  function handleFiles(list: FileList | null | undefined) {
    const xlsx = Array.from(list ?? []).filter((f) => f.name.toLowerCase().endsWith('.xlsx'))
    if (xlsx.length > 0) void upload(xlsx)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    handleFiles(e.dataTransfer.files)
  }
```

And the `<input>` line becomes:

```tsx
        <input type="file" accept=".xlsx" multiple onChange={onChange} disabled={busy} className="hidden" />
```

Run: `npm test -- --run src/components/UploadZone.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Render `ServerList` in `App`**

In `src/App.tsx`, add the import:

```tsx
import { ServerList } from './components/ServerList'
```

Update the `<main>` block to include it between `UploadZone` and `Dashboard`:

```tsx
      <main className="space-y-6 p-6">
        <UploadZone />
        <ServerList />
        {view && <Dashboard view={view.combined} />}
      </main>
```

- [ ] **Step 7: Run the full suite, type-check, lint, commit**

```bash
npm test -- --run
npx tsc -p tsconfig.app.json --noEmit
npx biome check --write src/hooks/useReportUpload.ts src/components/UploadZone.tsx src/components/UploadZone.test.tsx src/components/ServerList.tsx src/components/ServerList.test.tsx src/App.tsx src/i18n/locales
git add src/hooks/useReportUpload.ts src/components/UploadZone.tsx src/components/UploadZone.test.tsx src/components/ServerList.tsx src/components/ServerList.test.tsx src/App.tsx src/i18n/locales
git commit -m "feat(upload): multi-file intake + ServerList management"
```

---

## Task 6: Surface warnings (WarningsBanner)

`view.warnings` is currently produced but never displayed. This task surfaces it (fixing the existing single-file gap and delivering the estate "always warn" guarantee).

**Files:**
- Create: `src/components/dashboard/WarningsBanner.tsx`, `src/components/dashboard/WarningsBanner.test.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx` (render the banner)
- Modify: `src/i18n/locales/{en,de,fr,it}/common.json` (`warnings.title`)

**Interfaces:**
- Consumes: `ReportView.warnings`.
- Produces: `<WarningsBanner warnings={string[]} />` — renders nothing when empty.

- [ ] **Step 1: Add `warnings.title` to all four locales**

`en`: `"warnings": { "title": "Data caveats" },`
`fr`: `"warnings": { "title": "Mises en garde" },`
`de`: `"warnings": { "title": "Datenhinweise" },`
`it`: `"warnings": { "title": "Avvertenze sui dati" },`

Add each to the respective `common.json` (e.g. after the `servers` block).

Run: `npm test -- --run src/i18n/keyParity.test.ts`
Expected: PASS.

- [ ] **Step 2: Write the failing test**

Create `src/components/dashboard/WarningsBanner.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { WarningsBanner } from './WarningsBanner'

describe('WarningsBanner', () => {
  beforeEach(async () => await i18n.changeLanguage('en'))
  afterEach(() => cleanup())

  it('renders nothing when there are no warnings', () => {
    const { container } = render(<WarningsBanner warnings={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders each unique warning', () => {
    render(<WarningsBanner warnings={['a caveat', 'a caveat', 'another']} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('another')).toBeInTheDocument()
  })
})
```

Run: `npm test -- --run src/components/dashboard/WarningsBanner.test.tsx`
Expected: FAIL — `Failed to resolve import "./WarningsBanner"`.

- [ ] **Step 3: Implement `WarningsBanner`**

Create `src/components/dashboard/WarningsBanner.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

interface WarningsBannerProps {
  warnings: string[]
}

/** Amber caveats panel for data warnings (capped windows, merge notes). */
export function WarningsBanner({ warnings }: WarningsBannerProps) {
  const { t } = useTranslation('common')
  const unique = [...new Set(warnings)]
  if (unique.length === 0) return null

  return (
    <section
      aria-label={t('warnings.title')}
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <p className="mb-2 text-sm font-semibold">⚠ {t('warnings.title')}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {unique.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </section>
  )
}
```

Run: `npm test -- --run src/components/dashboard/WarningsBanner.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Render the banner in `Dashboard`**

In `src/components/dashboard/Dashboard.tsx`, add the import:

```tsx
import { WarningsBanner } from './WarningsBanner'
```

Insert the banner as the first child inside the returned container, before `<ExecutiveKpis ... />`:

```tsx
      <WarningsBanner warnings={view.warnings} />
      <ExecutiveKpis view={view} />
```

- [ ] **Step 5: Full suite, type-check, lint, commit**

```bash
npm test -- --run
npx tsc -p tsconfig.app.json --noEmit
npx biome check --write src/components/dashboard/WarningsBanner.tsx src/components/dashboard/WarningsBanner.test.tsx src/components/dashboard/Dashboard.tsx src/i18n/locales
git add src/components/dashboard/WarningsBanner.tsx src/components/dashboard/WarningsBanner.test.tsx src/components/dashboard/Dashboard.tsx src/i18n/locales
git commit -m "feat(dashboard): surface data warnings (WarningsBanner)"
```

---

## Task 7: Per-server breakdown (dashboard)

**Files:**
- Create: `src/components/dashboard/PerServerSection.tsx`, `src/components/dashboard/PerServerSection.test.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx` (accept + render breakdown), `src/App.tsx` (pass `perServer`)
- Modify: `src/i18n/locales/{en,de,fr,it}/dashboard.json` (`perServer.*`)

**Interfaces:**
- Consumes: `ServerView[]` from `src/types/reportView.ts`; `Chart`, `horizontalBarOption`/`BarDatum`, format helpers, `DARK`/`LIGHT`.
- Produces: `<PerServerSection servers={ServerView[]} dark={boolean} />` — renders nothing when `servers.length < 2`.
- `Dashboard` gains a `perServer?: ServerView[]` prop.

- [ ] **Step 1: Add `perServer.*` keys to all four locales**

In `src/i18n/locales/en/dashboard.json`, add:

```json
  "perServer": {
    "title": "Per-server breakdown",
    "col": { "server": "Server", "version": "Version", "captured": "Captured" }
  },
```

`fr`:

```json
  "perServer": {
    "title": "Détail par serveur",
    "col": { "server": "Serveur", "version": "Version", "captured": "Capturé le" }
  },
```

`de`:

```json
  "perServer": {
    "title": "Aufschlüsselung pro Server",
    "col": { "server": "Server", "version": "Version", "captured": "Erfasst" }
  },
```

`it`:

```json
  "perServer": {
    "title": "Dettaglio per server",
    "col": { "server": "Server", "version": "Versione", "captured": "Acquisito" }
  },
```

Run: `npm test -- --run src/i18n/keyParity.test.ts`
Expected: PASS.

- [ ] **Step 2: Write the failing test**

Create `src/components/dashboard/PerServerSection.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import type { ReportView, ServerView } from '../../types/reportView'
import { PerServerSection } from './PerServerSection'

function view(pct: number, count: number): ReportView {
  return {
    meta: { projectId: '', customer: 'ACME', collectorBuild: '', capturedAt: '2026-03-09', baseTen: true },
    inUse: [],
    idleAgents: [],
    warnings: [],
    coverage: { byType: {}, overall: { protected: 1, unprotected: 1, excluded: 0, pct, pctInclExcluded: pct } },
    gaps: { count, totalCapacityGb: 1000, top: { items: [], total: count, shown: 0 } },
    jobs: { counts: {}, total: 10, successPct: 0.9, capped: false, windowSize: 10 },
    compliance: { appConsistentPct: 0, immutablePct: 0, replicatedPct: 0, backupLevelMix: {}, windowSize: 0, capped: false },
    capacity: { targets: [], flagged: [], mtreeCount: 0 },
    policies: { count: 0, byPurpose: {}, perPolicy: [] },
  }
}
const servers: ServerView[] = [
  { label: 'ppdm-paris', version: '19.22', view: view(0.91, 12) },
  { label: 'ppdm-lyon', version: '19.21', view: view(0.82, 19) },
]

describe('PerServerSection', () => {
  beforeEach(async () => await i18n.changeLanguage('en'))
  afterEach(() => cleanup())

  it('renders nothing for a single server', () => {
    const { container } = render(<PerServerSection servers={[servers[0]]} dark={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a row per server with its label and version', () => {
    render(<PerServerSection servers={servers} dark={false} />)
    expect(screen.getByText('ppdm-paris')).toBeInTheDocument()
    expect(screen.getByText('ppdm-lyon')).toBeInTheDocument()
    expect(screen.getByText('19.22')).toBeInTheDocument()
  })

  it('renders the comparison chart', () => {
    render(<PerServerSection servers={servers} dark={false} />)
    expect(screen.getByTestId('per-server-bars')).toBeInTheDocument()
  })
})
```

Run: `npm test -- --run src/components/dashboard/PerServerSection.test.tsx`
Expected: FAIL — `Failed to resolve import "./PerServerSection"`.

- [ ] **Step 3: Implement `PerServerSection`**

Create `src/components/dashboard/PerServerSection.tsx`:

```tsx
import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DARK, LIGHT } from '../../theme/palette'
import type { ServerView } from '../../types/reportView'
import { fmtDate, fmtInt, fmtPercent, formatBytes, gbToBytes } from '../../utils/format'
import { Chart } from '../Chart'
import { type BarDatum, horizontalBarOption } from './barOption'

interface PerServerSectionProps {
  servers: ServerView[]
  dark: boolean
}

/** Per-server comparison: coverage-% bar chart + a KPI table across servers. */
export function PerServerSection({ servers, dark }: PerServerSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT

  const barData: BarDatum[] = useMemo(
    () =>
      servers.map((s) => ({
        label: s.label,
        value: s.view.coverage.overall.pct,
        valueText: fmtPercent(s.view.coverage.overall.pct, locale),
        color: s.view.coverage.overall.pct < 0.5 ? palette.bad : palette.ok,
      })),
    [servers, locale, palette],
  )
  const barOption: EChartsOption = useMemo(
    () => horizontalBarOption(barData, palette, 1),
    [barData, palette],
  )

  if (servers.length < 2) return null

  return (
    <section aria-label={t('dashboard:perServer.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:perServer.title')}
      </h2>
      <Chart
        option={barOption}
        dark={dark}
        testId="per-server-bars"
        style={{ minHeight: Math.max(120, servers.length * 34), width: '100%' }}
      />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('dashboard:perServer.col.server')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:kpi.coverage')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:gaps.assets')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:gaps.unprotectedTb')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:jobs.success')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:perServer.col.captured')}</th>
              <th className="pb-2 font-medium">{t('dashboard:perServer.col.version')}</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr
                key={s.label}
                className="border-b border-gray-100 text-gray-800 dark:border-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{s.label}</td>
                <td className="py-1.5 pr-4">{fmtPercent(s.view.coverage.overall.pct, locale)}</td>
                <td className="py-1.5 pr-4">{fmtInt(s.view.gaps.count, locale)}</td>
                <td className="py-1.5 pr-4">
                  {formatBytes(gbToBytes(s.view.gaps.totalCapacityGb), locale)}
                </td>
                <td className="py-1.5 pr-4">{fmtPercent(s.view.jobs.successPct, locale)}</td>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                  {fmtDate(s.view.meta.capturedAt.slice(0, 10), locale)}
                </td>
                <td className="py-1.5 text-gray-500 dark:text-gray-400">{s.version || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

Run: `npm test -- --run src/components/dashboard/PerServerSection.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 4: Wire `Dashboard` + `App` to pass `perServer`**

In `src/components/dashboard/Dashboard.tsx`:

Add imports:

```tsx
import type { ReportView, ServerView } from '../../types/reportView'
import { PerServerSection } from './PerServerSection'
```

(Replace the existing `import type { ReportView } ...` line.)

Change the props interface and signature:

```tsx
interface DashboardProps {
  view: ReportView
  perServer?: ServerView[]
}

export function Dashboard({ view, perServer = [] }: DashboardProps) {
```

Render the breakdown right after `WarningsBanner`/`ExecutiveKpis`:

```tsx
      <WarningsBanner warnings={view.warnings} />
      <ExecutiveKpis view={view} />
      <PerServerSection servers={perServer} dark={dark} />
```

In `src/App.tsx`, pass `perServer` to `Dashboard`:

```tsx
        {view && <Dashboard view={view.combined} perServer={view.perServer} />}
```

- [ ] **Step 5: Full suite, type-check, lint, commit**

```bash
npm test -- --run
npx tsc -p tsconfig.app.json --noEmit
npx biome check --write src/components/dashboard/PerServerSection.tsx src/components/dashboard/PerServerSection.test.tsx src/components/dashboard/Dashboard.tsx src/App.tsx src/i18n/locales
git add src/components/dashboard/PerServerSection.tsx src/components/dashboard/PerServerSection.test.tsx src/components/dashboard/Dashboard.tsx src/App.tsx src/i18n/locales
git commit -m "feat(dashboard): per-server breakdown section"
```

---

## Task 8: Per-server breakdown in exports

**Files:**
- Modify: `src/engines/export/sectionOrder.ts`, `src/engines/export/buildExportModel.ts`, `src/engines/export/buildExportModel.test.ts`, `src/hooks/useExport.ts`, `src/components/ExportButtons.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `EstateView`, `ServerView`.
- Produces:
  - `SectionId` gains `'perServer'`.
  - `buildExportModel(view, flavor, theme, t, locale, perServer?: ServerView[])` — emits a `perServer` section when `perServer.length > 1`.
  - `useExport(estate: EstateView | null)`; `ExportButtons({ view: EstateView | null })`.

- [ ] **Step 1: Add the `'perServer'` SectionId (front of both flavors)**

Replace `src/engines/export/sectionOrder.ts`:

```ts
export type ExportFlavor = 'assessment' | 'ops'
export type SectionId =
  | 'perServer'
  | 'coverage'
  | 'gaps'
  | 'idle'
  | 'jobs'
  | 'compliance'
  | 'capacity'
  | 'policies'
export const SECTION_ORDER: Record<ExportFlavor, SectionId[]> = {
  assessment: ['perServer', 'coverage', 'gaps', 'idle', 'jobs', 'compliance', 'capacity', 'policies'],
  ops: ['perServer', 'jobs', 'compliance', 'capacity', 'coverage', 'gaps', 'idle', 'policies'],
}
```

- [ ] **Step 2: Write the failing buildExportModel test**

Append to `src/engines/export/buildExportModel.test.ts` (the `view` fixture and `t` already exist at the top of the file). Add inside the existing `describe('buildExportModel', ...)` block:

```ts
  it('omits the per-server section for a single source', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    expect(model.sections.find((s) => s.id === 'perServer')).toBeUndefined()
  })

  it('emits a per-server section with one bar per server when multi-source', () => {
    const perServer = [
      { label: 'ppdm-a', version: '19.22', view },
      { label: 'ppdm-b', version: '19.21', view },
    ]
    const model = buildExportModel(view, 'assessment', 'light', t, 'en', perServer)
    const section = model.sections.find((s) => s.id === 'perServer')
    expect(section).toBeDefined()
    expect(section?.deck?.bars).toHaveLength(2)
    expect(model.sections[0].id).toBe('perServer')
  })
```

Run: `npm test -- --run src/engines/export/buildExportModel.test.ts`
Expected: FAIL — `buildExportModel` takes 5 args / has no `perServer` section.

- [ ] **Step 3: Implement the per-server section in `buildExportModel`**

In `src/engines/export/buildExportModel.ts`:

Add the import (with the other type imports at the top):

```ts
import type { ReportView, ServerView } from '../../types/reportView'
```

(Replace the existing `import type { ReportView } from '../../types/reportView'` line.)

Change the function signature to accept `perServer`:

```ts
export function buildExportModel(
  view: ReportView,
  flavor: ExportFlavor,
  theme: ExportTheme,
  t: TFn,
  locale: string,
  perServer: ServerView[] = [],
): ExportModel {
```

Build the section (place this next to `idleSection`, before the `byId` map):

```ts
  const perServerSection: ExportSection | null =
    perServer.length > 1
      ? {
          id: 'perServer',
          title: t('dashboard:perServer.title'),
          table: {
            columns: [
              t('dashboard:perServer.col.server'),
              t('dashboard:kpi.coverage'),
              t('dashboard:gaps.assets'),
              t('dashboard:jobs.success'),
            ],
            rows: perServer.map((s) => [
              s.label,
              fmtPercent(s.view.coverage.overall.pct, locale),
              fmtInt(s.view.gaps.count, locale),
              fmtPercent(s.view.jobs.successPct, locale),
            ]),
          },
          deck: {
            kpiChips: [
              {
                label: t('dashboard:perServer.title'),
                value: fmtInt(perServer.length, locale),
                tone: 'accent',
              },
            ],
            bars: toBars(
              perServer.map((s) => ({
                label: s.label,
                magnitude: s.view.coverage.overall.pct,
                value: fmtPercent(s.view.coverage.overall.pct, locale),
                tone: s.view.coverage.overall.pct < 0.5 ? ('warn' as const) : ('ok' as const),
              })),
              pal,
            ),
          },
        }
      : null
```

Add `perServer` to the `byId` map (as the first entry):

```ts
  const byId: Record<SectionId, ExportSection | null> = {
    perServer: perServerSection,
    coverage: coverageSection,
    gaps: gapsSection,
    idle: idleSection,
    jobs: jobsSection,
    compliance: complianceSection,
    capacity: capacitySection,
    policies: policiesSection,
  }
```

Run: `npm test -- --run src/engines/export/buildExportModel.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 4: Thread `EstateView` through `useExport` and `ExportButtons`**

In `src/hooks/useExport.ts`:

Replace the `ReportView` import with `EstateView`:

```ts
import type { EstateView } from '../types/reportView'
```

Change the hook signature and body to use the estate:

```ts
export function useExport(estate: EstateView | null) {
```

Inside `run`, replace the guard and model build:

```ts
    if (!estate) return
    setBusy(kind)
    setError(null)
    try {
      const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string
      const model = buildExportModel(
        estate.combined,
        flavor,
        resolved,
        t,
        i18n.language,
        estate.perServer,
      )
      const stamp = new Date().toISOString().slice(0, 10)
      const base = `ppdm-report_${sanitize(estate.combined.meta.customer)}_${stamp}`
```

(The rest of `run` is unchanged.)

In `src/components/ExportButtons.tsx`:

Replace the `ReportView` import:

```ts
import type { EstateView } from '../types/reportView'
```

Change the prop type:

```tsx
export function ExportButtons({ view }: { view: EstateView | null }) {
```

In `src/App.tsx`, pass the whole estate to `ExportButtons` (revert the Task 4 `.combined`):

```tsx
          <ExportButtons view={view} />
```

- [ ] **Step 5: Full suite, type-check, lint, commit**

```bash
npm test -- --run
npx tsc -p tsconfig.app.json --noEmit
npx biome check --write src/engines/export/sectionOrder.ts src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/hooks/useExport.ts src/components/ExportButtons.tsx src/App.tsx
git add src/engines/export/sectionOrder.ts src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/hooks/useExport.ts src/components/ExportButtons.tsx src/App.tsx
git commit -m "feat(export): per-server breakdown section in PPTX + HTML"
```

---

## Task 9: Warnings in exports

**Files:**
- Modify: `src/engines/export/types.ts`, `src/engines/export/buildExportModel.ts`, `src/engines/export/buildExportModel.test.ts`, `src/engines/export/html/assembleHtml.ts`, `src/engines/export/html/assembleHtml.test.ts`, `src/engines/export/pptx/builder.ts`

**Interfaces:**
- Consumes: `ReportView.warnings`.
- Produces: `ExportModel.warnings?: string[]`; rendered as a block in the HTML export and on the PPTX title slide.

- [ ] **Step 1: Add `warnings` to `ExportModel`**

In `src/engines/export/types.ts`, add to the `ExportModel` interface (after `footer`):

```ts
  /** Data caveats (capped windows, merge notes); rendered in both exports. */
  warnings?: string[]
```

- [ ] **Step 2: Write the failing tests**

Append to `src/engines/export/buildExportModel.test.ts` inside the `describe` block:

```ts
  it('passes deduplicated warnings into the model', () => {
    const dup: ReportView = { ...view, warnings: ['cap note', 'cap note', 'merge note'] }
    const model = buildExportModel(dup, 'assessment', 'light', t, 'en')
    expect(model.warnings).toEqual(['cap note', 'merge note'])
  })
```

Append to `src/engines/export/html/assembleHtml.test.ts` (match its existing import/fixture style — it builds an `ExportModel`; add a focused test):

```ts
import { describe, expect, it } from 'vitest'
import type { ExportModel } from '../types'
import { assembleHtml } from './assembleHtml'

const baseModel: ExportModel = {
  title: 'PPDM Report',
  customer: 'ACME',
  subtitle: 'Assessment',
  execTitle: 'Executive summary',
  locale: 'en',
  kpis: [],
  sections: [],
  footer: 'ACME',
  warnings: ['blended window note'],
}

describe('assembleHtml warnings', () => {
  it('renders the warnings block', () => {
    const html = assembleHtml(baseModel, 'light')
    expect(html).toContain('blended window note')
  })

  it('omits the warnings block when none', () => {
    const html = assembleHtml({ ...baseModel, warnings: [] }, 'light')
    expect(html).not.toContain('class="warnings"')
  })
})
```

Run: `npm test -- --run src/engines/export/buildExportModel.test.ts src/engines/export/html/assembleHtml.test.ts`
Expected: FAIL — `model.warnings` undefined; no warnings block in HTML.

> Note: if `assembleHtml.test.ts` already imports `ExportModel`/`assembleHtml`, append only the new `describe` block and reuse its fixture instead of redeclaring imports.

- [ ] **Step 3: Populate `warnings` in `buildExportModel`**

In `src/engines/export/buildExportModel.ts`, add to the returned object (after `posture`):

```ts
    warnings: [...new Set(view.warnings)],
```

- [ ] **Step 4: Render warnings in the HTML export**

In `src/engines/export/html/assembleHtml.ts`:

Add a CSS rule to the `css` template (append inside the template string, before the closing backtick):

```ts
    .warnings{margin:20px 0;padding:14px 18px;border:1px solid ${p.line};border-left:4px solid ${p.bad};border-radius:10px;background:${p.surface}} .warnings h2{font-size:14px;margin:0 0 8px} .warnings ul{margin:0;padding-left:20px;font-size:12px;color:${p.muted}} .warnings li{margin:3px 0}
```

Add the warnings block construction before the `return`:

```ts
  const warnings =
    model.warnings && model.warnings.length > 0
      ? `<section class="warnings"><h2>⚠ ${esc('Data caveats')}</h2><ul>${model.warnings
          .map((w) => `<li>${esc(w)}</li>`)
          .join('')}</ul></section>`
      : ''
```

Insert `${warnings}` into the body, right after the `${posture}` line:

```ts
${posture}
${warnings}
${sections}
```

Run: `npm test -- --run src/engines/export/html/assembleHtml.test.ts`
Expected: PASS.

- [ ] **Step 5: Render warnings on the PPTX title slide**

In `src/engines/export/pptx/builder.ts`, in `buildPptx`, after the `title.addText(model.footer, …)` block (around line 388), add:

```ts
  if (model.warnings && model.warnings.length > 0) {
    title.addText(`⚠ ${model.warnings.slice(0, 6).join('\n')}`, {
      x: M,
      y: 4.6,
      w: CONTENT_W,
      h: 2.2,
      fontSize: 10,
      italic: true,
      color: hx(p.muted),
      valign: 'top',
      fontFace: FONT,
    })
  }
```

- [ ] **Step 6: Full suite, type-check, lint, commit**

```bash
npm test -- --run
npx tsc -p tsconfig.app.json --noEmit
npx biome check --write src/engines/export/types.ts src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/engines/export/html/assembleHtml.ts src/engines/export/html/assembleHtml.test.ts src/engines/export/pptx/builder.ts
git add src/engines/export/types.ts src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/engines/export/html/assembleHtml.ts src/engines/export/html/assembleHtml.test.ts src/engines/export/pptx/builder.ts
git commit -m "feat(export): surface data warnings in PPTX + HTML"
```

---

## Task 10: Documentation

**Files:**
- Create: `docs/adr/0009-estate-merge-model.md`
- Modify: `docs/adr/0002-xlsx-input-model.md`, `README.md`, `docs/USER-GUIDE.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Amend ADR 0002**

In `docs/adr/0002-xlsx-input-model.md`, replace the first "Consequences" bullet:

```
- No multi-extract merge or trend analysis in v1 (single extract per session).
```

with:

```
- Multi-extract **merge** is supported (see ADR 0009): several Live Optics exports combine into one estate. Trend/time-series analysis across snapshots remains out of scope.
```

- [ ] **Step 2: Write ADR 0009**

Create `docs/adr/0009-estate-merge-model.md`:

```markdown
# ADR 0009 — Estate Merge Model (Multiple PPDM Servers)

**Status:** Accepted

## Context

A customer with several PPDM servers produces one Live Optics `.xlsx` export per
server. Users need a single combined report plus visibility into each server's
contribution. The pipeline already funnels through one type, `ParsedWorkbook`,
consumed by the pure `buildReportView`.

## Decision

A pure `mergeWorkbooks(ServerWorkbook[]) → ParsedWorkbook` folds N exports into
one estate workbook: rows concatenated per sheet, headers unioned, `capped`
OR-ed, agents re-classified on the merged sheets, and metadata folded (shared
customer; latest capture date). The combined report is
`buildReportView(mergeWorkbooks(servers))`; the per-server breakdown is
`servers.map(buildReportView)` — the same engine, reused. The store holds a
`servers[]` list; `useReportView` derives an `EstateView`
(`combined` + `perServer` + `multiSource`).

Merge is **always-warn, never-block** (ADR 0004): base-10/base-2 unit mismatch,
suspected duplicate uploads (same appliance host or project+snapshot), and
sheets capped across multiple sources each raise a warning. Warnings are
surfaced in the dashboard and both exports. A server's label is the appliance
**Host Name** (`System Information`), falling back to Project Name, then filename.

## Consequences

- The 6 aggregation engines and both export renderers are unchanged; all new
  logic lives in `mergeWorkbooks` plus a thin UI/derivation layer.
- A single uploaded file is an identity merge — behavior is unchanged.
- No de-duplication of overlapping assets: workbooks concatenate; duplicate
  *files* are flagged, not removed.
- Capacity figures across mixed base-10/base-2 sources are flagged, not
  converted (the app surfaces utilization % and mtree counts, not summed bytes).
```

- [ ] **Step 3: Update README and USER-GUIDE**

In `README.md`, under "What it does" / key capabilities, add a bullet:

```
- **Multi-server estate** — drop several Live Optics exports to merge them into one combined report, with a per-server breakdown and clear caveats when sources don't cleanly combine.
```

In `docs/USER-GUIDE.md`, add a short section describing: dropping multiple `.xlsx` files (or adding more later), the loaded-servers strip with remove / clear-all, the per-server breakdown, and that mismatched or duplicate sources are flagged but never blocked. (Write 1–2 short paragraphs matching the guide's existing tone.)

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0009-estate-merge-model.md docs/adr/0002-xlsx-input-model.md README.md docs/USER-GUIDE.md
git commit -m "docs: estate merge model (ADR 0009) + user guide"
```

---

## Final verification

- [ ] **Run the full suite:** `npm test -- --run` — all green.
- [ ] **Type-check:** `npx tsc -p tsconfig.app.json --noEmit` — no errors.
- [ ] **Lint/format:** `npx biome check src` — clean.
- [ ] **Manual smoke (optional):** `npm run dev`, drop `ref/PPDM.xlsx` twice (it will flag a duplicate-host warning and show a 2-server breakdown), export PPTX + HTML, confirm the per-server slide/section and the warnings block render.

---

## Self-Review (completed during planning)

**Spec coverage:**
- Combined estate (`mergeWorkbooks` + `buildReportView`) — Tasks 2, 4. ✓
- Per-server breakdown (dashboard + exports) — Tasks 7, 8. ✓
- Always-warn-never-block (unit mismatch, duplicate, blended windows) — Task 3; surfaced in Tasks 6, 9. ✓
- Server label = Host Name → customer → filename — Task 1. ✓
- Single customer (first value) — Task 2 meta fold. ✓
- Multi-file upload + management — Task 5. ✓
- Single-file unchanged (identity merge + invariant test) — Tasks 2, 4. ✓
- i18n across 4 locales — Tasks 5, 6, 7 (+ keyParity gate). ✓
- Docs / ADRs — Task 10. ✓

**Added beyond the spec (necessary, discovered during planning):** `warnings` were produced but never displayed; Tasks 6 and 9 surface them in the dashboard and exports so the "always warn" guarantee is real.

**Type consistency:** `ServerWorkbook` (Task 1) → store/merge (Tasks 2–4); `ServerView`/`EstateView` (Task 4) → dashboard (Task 7) + exports (Task 8); `SectionId 'perServer'` (Task 8) matches the `byId` key and `buildExportModel` section id; `ExportModel.warnings` (Task 9) matches producer (`buildExportModel`) and consumers (`assembleHtml`, `builder`). Consistent.

**Placeholder scan:** none — every code step shows complete code; USER-GUIDE prose is the one descriptive step (no code), which is appropriate for documentation.
