# Front-end Volumetry by Workload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Front-end volumetry by workload" report section that reports discovered and FETB (licensed) front-end TB per workload/agent type, split protected vs unprotected, as a table-first PPTX slide + HTML block.

**Architecture:** One new derived field `ReportView.frontEnd` populated by a pure aggregation engine (`computeFrontEnd`) for PPDM detail, with degraded-but-honest population for PPDM summary and NetWorker and an empty (suppressed) value for Avamar. Rendered table-first via a `planSlides` special-case reusing the existing `drawTableSlide`. Totals are derived at render, never stored.

**Tech Stack:** TypeScript, Vitest, pptxgenjs, i18next, Biome. Pure functions under `src/engines/`.

**Spec:** `docs/superpowers/specs/2026-06-22-front-end-volumetry-sizing-design.md`

## Global Constraints

- **Engines are pure** — no React, DOM, store, or `Date.now()` nondeterminism in `src/engines/`.
- **Base-10 byte formatting** — format GB via `formatBytes(gbToBytes(gb), locale)`; missing sizes via `formatGbOrUnknown(gb, locale, t('common:sizeUnknown'))`. Never base-2, never a fake 0.
- **i18n parity (en/fr/de/it)** — every new key added to all four `dashboard.json`; `src/i18n/keyParity.test.ts` fails CI otherwise.
- **Biome style** — single quotes, no semicolons, 2-space indent, 100-col width. `noUnusedImports`/`noUnusedVariables` are errors.
- **Tests use synthetic workbooks** — build via `makeWorkbook(...)` or inline `SheetData`; never read from `ref/` (absent in CI).
- **Coverage gate** — ≥75% on `engines/utils/privacy`.
- **CI order** — `npm run typecheck` → `npm run lint` → `npm run test:run` → `npm run build`. Match before claiming done.
- **No derived metric is stored** — totals are computed at render from `byType`.

---

### Task 1: `FrontEnd` types, provenance, empty value wired end-to-end

Make the `frontEnd` field exist and flow through every builder + the merge layer with empty data, so the tree compiles and the full suite stays green before any per-product computation.

**Files:**
- Modify: `src/types/reportView.ts`
- Create: `src/engines/aggregation/frontEnd.ts`
- Create: `src/engines/aggregation/frontEnd.test.ts`
- Modify: `src/engines/aggregation/provenance.ts`
- Modify: `src/engines/aggregation/mergeViews.ts`
- Modify: `src/engines/products/ppdm/buildPpdmView.ts`
- Modify: `src/engines/aggregation/summaryView.ts`
- Modify: `src/engines/products/networker/buildNetworkerView.ts`
- Modify: `src/engines/products/avamar/buildAvamarView.ts`
- Modify: `src/engines/aggregation/mergeViews.test.ts` (the `detail()` helper)

**Interfaces:**
- Produces: `interface FrontEndTypeRow`, `interface FrontEnd`, `ReportView.frontEnd: FrontEnd`, `MetricKey` adds `'frontEnd'`.
- Produces: `emptyFrontEnd(): FrontEnd`, `mergeFrontEnd(frontEnds: FrontEnd[]): FrontEnd`, `FRONT_END_METRICS` (readonly tuple of the four GB field names).

- [ ] **Step 1: Add the types to `src/types/reportView.ts`**

Change the `MetricKey` line and add the interfaces before `ReportView`:

```ts
export type MetricKey = 'coverageByType' | 'gapsList' | 'compliance' | 'storageTargets' | 'frontEnd'
```

```ts
/** Front-end volume for one workload type. Size fields are tri-state: a number ≥ 0 = measured;
 * undefined = "no figure" (column absent or assets present but sums to 0) → renders "–". */
export interface FrontEndTypeRow {
  type: string
  protectedDiscoveredGb?: number
  protectedFetbGb?: number
  unprotectedDiscoveredGb?: number
  unprotectedFetbGb?: number
}

/** Per-type front-end volumetry for one scope. Totals are derived at render, never stored. */
export interface FrontEnd {
  byType: FrontEndTypeRow[]
  /** EXCLUDED assets across in-use types — footnote only, never in totals. */
  excludedCount: number
}
```

Add `frontEnd: FrontEnd` to the `ReportView` interface (after `policies`).

- [ ] **Step 2: Write the failing test for the helpers** in `src/engines/aggregation/frontEnd.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { emptyFrontEnd, mergeFrontEnd } from './frontEnd'

describe('frontEnd helpers', () => {
  it('emptyFrontEnd is an empty, zero value', () => {
    expect(emptyFrontEnd()).toEqual({ byType: [], excludedCount: 0 })
  })

  it('mergeFrontEnd unions types and sums defined fields, keeping undefined until a reporter', () => {
    const a = { byType: [{ type: 'VM', protectedFetbGb: 10 }], excludedCount: 1 }
    const b = {
      byType: [{ type: 'VM', protectedFetbGb: 5, protectedDiscoveredGb: 20 }, { type: 'FS', protectedFetbGb: 3 }],
      excludedCount: 2,
    }
    const m = mergeFrontEnd([a, b])
    const vm = m.byType.find((r) => r.type === 'VM')
    expect(vm).toEqual({ type: 'VM', protectedFetbGb: 15, protectedDiscoveredGb: 20 })
    expect(m.byType.find((r) => r.type === 'FS')?.protectedFetbGb).toBe(3)
    expect(m.excludedCount).toBe(3)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/engines/aggregation/frontEnd.test.ts`
Expected: FAIL — `emptyFrontEnd`/`mergeFrontEnd` not exported.

- [ ] **Step 4: Implement `src/engines/aggregation/frontEnd.ts`** (helpers only; `computeFrontEnd` lands in Task 2)

```ts
import type { FrontEnd, FrontEndTypeRow } from '../../types/reportView'

/** The four GB fields of a FrontEndTypeRow, in display order. */
export const FRONT_END_METRICS = [
  'protectedDiscoveredGb',
  'protectedFetbGb',
  'unprotectedDiscoveredGb',
  'unprotectedFetbGb',
] as const

/** An empty front-end value (no in-use types, nothing excluded). */
export function emptyFrontEnd(): FrontEnd {
  return { byType: [], excludedCount: 0 }
}

/** Fold per-server FrontEnd values: union types, sum defined fields (undefined until a reporter). */
export function mergeFrontEnd(frontEnds: FrontEnd[]): FrontEnd {
  const byType = new Map<string, FrontEndTypeRow>()
  for (const fe of frontEnds) {
    for (const row of fe.byType) {
      const acc = byType.get(row.type) ?? { type: row.type }
      for (const k of FRONT_END_METRICS) {
        const add = row[k]
        if (add !== undefined) acc[k] = (acc[k] ?? 0) + add
      }
      byType.set(row.type, acc)
    }
  }
  return {
    byType: [...byType.values()],
    excludedCount: frontEnds.reduce((a, fe) => a + fe.excludedCount, 0),
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/engines/aggregation/frontEnd.test.ts`
Expected: PASS.

- [ ] **Step 6: Thread `'frontEnd'` through `src/engines/aggregation/provenance.ts`**

Add a `frontEnd` entry to each helper's returned record:
- `allAvailable`: `frontEnd: { available: true, serversCovered: 1, serversTotal: 1 }`
- `allUnavailable`: `frontEnd: { available: false, serversCovered: 0, serversTotal: 1 }`
- `avamarProvenance`: `frontEnd: { available: false, serversCovered: 0, serversTotal: 1 }`
- `networkerProvenance`: `frontEnd: { available: true, serversCovered: 1, serversTotal: 1 }`

- [ ] **Step 7: Wire empty `frontEnd` into all four builders**

- `src/engines/products/ppdm/buildPpdmView.ts`: import `emptyFrontEnd`, add `frontEnd: emptyFrontEnd()` to the returned object (replaced in Task 2).
- `src/engines/aggregation/summaryView.ts`: import `emptyFrontEnd`, add `frontEnd: emptyFrontEnd()` (replaced in Task 3).
- `src/engines/products/networker/buildNetworkerView.ts`: import `emptyFrontEnd`, add `frontEnd: emptyFrontEnd()` (replaced in Task 4).
- `src/engines/products/avamar/buildAvamarView.ts`: import `emptyFrontEnd`, add `frontEnd: emptyFrontEnd()` (permanent — Avamar has no per-type size).

- [ ] **Step 8: Fold `frontEnd` in `src/engines/aggregation/mergeViews.ts`**

Add `'frontEnd'` to the `mergeProvenance` keys array:

```ts
const keys: MetricKey[] = ['coverageByType', 'gapsList', 'compliance', 'storageTargets', 'frontEnd']
```

Import `mergeFrontEnd` and add to the merged object returned by `mergeViews` (after `policies`):

```ts
frontEnd: mergeFrontEnd(views.map((v) => v.frontEnd)),
```

- [ ] **Step 9: Update the `detail()` test helper** in `src/engines/aggregation/mergeViews.test.ts`

Add `frontEnd: { byType: [], excludedCount: 0 },` to the default object (before `provenance:`), so the literal satisfies the new `ReportView` shape.

- [ ] **Step 10: Run typecheck + full suite to verify the tree is green**

Run: `npm run typecheck && npm run test:run`
Expected: PASS. (If typecheck flags another `ReportView` literal, add `frontEnd: { byType: [], excludedCount: 0 }` to it.)

- [ ] **Step 11: Commit**

```bash
git add src/types/reportView.ts src/engines/aggregation/frontEnd.ts src/engines/aggregation/frontEnd.test.ts src/engines/aggregation/provenance.ts src/engines/aggregation/mergeViews.ts src/engines/aggregation/mergeViews.test.ts src/engines/products/ppdm/buildPpdmView.ts src/engines/aggregation/summaryView.ts src/engines/products/networker/buildNetworkerView.ts src/engines/products/avamar/buildAvamarView.ts
git commit -m "feat(frontEnd): add FrontEnd view field, provenance, and merge plumbing"
```

---

### Task 2: `computeFrontEnd` engine (PPDM detail)

**Files:**
- Modify: `src/engines/aggregation/frontEnd.ts`
- Modify: `src/engines/aggregation/frontEnd.test.ts`
- Modify: `src/engines/products/ppdm/buildPpdmView.ts`

**Interfaces:**
- Consumes: `cellNum`, `cellStr` from `./rows`; `RawWorkbook`, `SheetData` from `../../types/ppdm`.
- Produces: `computeFrontEnd(wb: RawWorkbook, inUse: string[]): FrontEnd`.

- [ ] **Step 1: Write the failing tests** (append to `frontEnd.test.ts`)

```ts
import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { computeFrontEnd } from './frontEnd'

function sh(name: string, headers: string[], rows: Array<Record<string, string | number>>): SheetData {
  return { name, headers, rows, capped: false }
}
function rwb(sheets: Record<string, SheetData>): RawWorkbook {
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets,
    warnings: [],
  }
}

describe('computeFrontEnd', () => {
  it('sums discovered + FETB per type by protection status; EXCLUDED → count only', () => {
    const wb = rwb({
      'Virtual Machines': sh(
        'Virtual Machines',
        ['Protection Status', 'Discovered Size (GB)', 'Asset Protection Size (Licensed) (GB)'],
        [
          { 'Protection Status': 'PROTECTED', 'Discovered Size (GB)': 100, 'Asset Protection Size (Licensed) (GB)': 60 },
          { 'Protection Status': 'PROTECTED', 'Discovered Size (GB)': 40, 'Asset Protection Size (Licensed) (GB)': 25 },
          { 'Protection Status': 'UNPROTECTED', 'Discovered Size (GB)': 30, 'Asset Protection Size (Licensed) (GB)': 0 },
          { 'Protection Status': 'EXCLUDED', 'Discovered Size (GB)': 999, 'Asset Protection Size (Licensed) (GB)': 999 },
        ],
      ),
    })
    const vm = computeFrontEnd(wb, ['Virtual Machines']).byType[0]
    expect(vm.protectedDiscoveredGb).toBe(140)
    expect(vm.protectedFetbGb).toBe(85)
    expect(vm.unprotectedDiscoveredGb).toBe(30)
    expect(vm.unprotectedFetbGb).toBeUndefined() // assets present but FETB sums to 0
    expect(computeFrontEnd(wb, ['Virtual Machines']).excludedCount).toBe(1)
  })

  it('treats a present-but-uniformly-zero column as undefined (SQL discovered)', () => {
    const wb = rwb({
      'SQL Databases': sh(
        'SQL Databases',
        ['Protection Status', 'Asset Total Size (GB)', 'Protection Capacity (GB)'],
        [
          { 'Protection Status': 'PROTECTED', 'Asset Total Size (GB)': 0, 'Protection Capacity (GB)': 15 },
          { 'Protection Status': 'UNPROTECTED', 'Asset Total Size (GB)': 0, 'Protection Capacity (GB)': 2 },
        ],
      ),
    })
    const sql = computeFrontEnd(wb, ['SQL Databases']).byType[0]
    expect(sql.protectedDiscoveredGb).toBeUndefined()
    expect(sql.protectedFetbGb).toBe(15)
    expect(sql.unprotectedFetbGb).toBe(2)
  })

  it('marks an absent size column undefined; empty bucket is a measured 0', () => {
    const wb = rwb({
      'File Systems': sh(
        'File Systems',
        ['Protection Status', 'Asset Total Discovered Size (GB)', 'Asset Licensed Size (GB)'],
        [{ 'Protection Status': 'PROTECTED', 'Asset Total Discovered Size (GB)': 100, 'Asset Licensed Size (GB)': 70 }],
      ),
      NAS: sh('NAS', ['Protection Status'], [{ 'Protection Status': 'PROTECTED' }]),
    })
    const fe = computeFrontEnd(wb, ['File Systems', 'NAS'])
    const fs = fe.byType.find((r) => r.type === 'File Systems')!
    expect(fs.unprotectedDiscoveredGb).toBe(0) // no unprotected assets → measured 0
    const nas = fe.byType.find((r) => r.type === 'NAS')!
    expect(nas.protectedDiscoveredGb).toBeUndefined() // column absent
    expect(nas.protectedFetbGb).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engines/aggregation/frontEnd.test.ts`
Expected: FAIL — `computeFrontEnd` not exported.

- [ ] **Step 3: Implement `computeFrontEnd`** (add to `src/engines/aggregation/frontEnd.ts`)

Add the imports at the top:

```ts
import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { cellNum, cellStr } from './rows'
```

Add the constants + function:

```ts
const DISCOVERED_COLS = [
  'Asset Total Discovered Size (GB)',
  'Asset Total Size (GB)',
  'Discovered Size (GB)',
]
const FETB_COLS = [
  'Asset Licensed Size (GB)',
  'Asset Licensed Protection Size (GB)',
  'Asset Protection Size (Licensed) (GB)',
  'Protection Capacity (GB)',
  'Asset FETB (GB)',
]

/** First candidate column present in the sheet's headers; '' when none match. */
function resolveCol(sheet: SheetData, candidates: string[]): string {
  return candidates.find((c) => sheet.headers.includes(c)) ?? ''
}

interface Bucket {
  count: number
  sum: number
  colPresent: boolean
}

/** Tri-state: 0 for an empty bucket (measured), the sum when > 0, undefined when assets exist
 * but the column is absent or sums to 0 (no figure). */
function resolveSize(b: Bucket): number | undefined {
  if (b.count === 0) return 0
  if (!b.colPresent) return undefined
  return b.sum > 0 ? b.sum : undefined
}

/** Front-end volume per in-use workload type, split protected/unprotected. PPDM detail only. Pure. */
export function computeFrontEnd(wb: RawWorkbook, inUse: string[]): FrontEnd {
  const byType: FrontEndTypeRow[] = []
  let excludedCount = 0
  for (const name of inUse) {
    const sheet = wb.sheets[name]
    if (!sheet) continue
    const discCol = resolveCol(sheet, DISCOVERED_COLS)
    const fetbCol = resolveCol(sheet, FETB_COLS)
    const pd: Bucket = { count: 0, sum: 0, colPresent: discCol !== '' }
    const pf: Bucket = { count: 0, sum: 0, colPresent: fetbCol !== '' }
    const ud: Bucket = { count: 0, sum: 0, colPresent: discCol !== '' }
    const uf: Bucket = { count: 0, sum: 0, colPresent: fetbCol !== '' }
    for (const row of sheet.rows) {
      const status = cellStr(row, 'Protection Status')
      if (status === 'EXCLUDED') {
        excludedCount++
        continue
      }
      const disc = discCol ? cellNum(row, discCol) : 0
      const fetb = fetbCol ? cellNum(row, fetbCol) : 0
      if (status === 'PROTECTED') {
        pd.count++
        pd.sum += disc
        pf.count++
        pf.sum += fetb
      } else if (status === 'UNPROTECTED') {
        ud.count++
        ud.sum += disc
        uf.count++
        uf.sum += fetb
      }
    }
    byType.push({
      type: name,
      protectedDiscoveredGb: resolveSize(pd),
      protectedFetbGb: resolveSize(pf),
      unprotectedDiscoveredGb: resolveSize(ud),
      unprotectedFetbGb: resolveSize(uf),
    })
  }
  return { byType, excludedCount }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/engines/aggregation/frontEnd.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `buildPpdmView`** — in `src/engines/products/ppdm/buildPpdmView.ts`, import `computeFrontEnd` (alongside `emptyFrontEnd`, which can now be dropped from the import if unused) and replace `frontEnd: emptyFrontEnd()` in the detail return with:

```ts
frontEnd: computeFrontEnd(wb, inUse),
```

- [ ] **Step 6: Run the PPDM + full engine suite**

Run: `npm run typecheck && npx vitest run src/engines`
Expected: PASS (the existing `buildPpdmView.test.ts` `provenance` assertion still holds — `allAvailable` now includes `frontEnd` on both sides).

- [ ] **Step 7: Commit**

```bash
git add src/engines/aggregation/frontEnd.ts src/engines/aggregation/frontEnd.test.ts src/engines/products/ppdm/buildPpdmView.ts
git commit -m "feat(frontEnd): compute per-type front-end volumetry for PPDM detail"
```

---

### Task 3: PPDM summary path

**Files:**
- Modify: `src/engines/aggregation/summaryView.ts`
- Modify: `src/engines/aggregation/summaryView.test.ts`

**Interfaces:**
- Consumes: existing `COUNT_CAP`, `fieldNum`, `allUnavailable` in `summaryView.ts`.

- [ ] **Step 1: Write the failing test** in `src/engines/aggregation/summaryView.test.ts`

```ts
import { makeWorkbook } from '../../test-helpers/workbooks'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { summaryView } from './summaryView'

it('builds discovered-only front-end volumetry per type and marks it available', () => {
  const wb = normalizeWorkbook(
    makeWorkbook({
      Details: [['Project Name', 'S'], ['Date', '18/02/2025 03:54:24'], ['Disclaimer', 'Base 10']],
      'System Configuration': [
        ['Field', 'Value'],
        ['Assets Count', 100],
        ['Number of Protected Assets', 80],
        ['Number of UnProtected Assets', 15],
      ],
      'VMs Count And Cap': [
        ['Field', 'Value'],
        ['VM Asset Count', 60],
        ['VM Capacity Protected Assets (GB)', 2555.53],
        ['VM Capacity Unprotected Assets (GB)', 5552.92],
      ],
    }),
  )
  const view = summaryView(wb)
  const vm = view.frontEnd.byType.find((r) => r.type === 'Virtual Machines')!
  expect(vm.protectedDiscoveredGb).toBeCloseTo(2555.53)
  expect(vm.unprotectedDiscoveredGb).toBeCloseTo(5552.92)
  expect(vm.protectedFetbGb).toBeUndefined()
  expect(view.provenance.frontEnd.available).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engines/aggregation/summaryView.test.ts`
Expected: FAIL — `frontEnd.byType` is empty and `provenance.frontEnd.available` is `false`.

- [ ] **Step 3: Implement** in `src/engines/aggregation/summaryView.ts`

Before the `return`, build the front-end value (reuse `COUNT_CAP` + `fieldNum`):

```ts
const feByType = []
for (const { sheet, agent } of COUNT_CAP) {
  if (!agent) continue
  const s = wb.sheets[sheet]
  if (!s || fieldNum(s, (f) => /Asset Count$/i.test(f)) <= 0) continue
  feByType.push({
    type: agent,
    protectedDiscoveredGb: fieldNum(s, (f) => /Capacity Protected Assets \(GB\)/i.test(f)),
    unprotectedDiscoveredGb: fieldNum(s, (f) => /Capacity Unprotected Assets \(GB\)/i.test(f)),
    protectedFetbGb: undefined,
    unprotectedFetbGb: undefined,
  })
}
```

Replace `frontEnd: emptyFrontEnd()` with `frontEnd: { byType: feByType, excludedCount: 0 }`, and override the provenance key (replace `provenance: allUnavailable(totalAssets),`):

```ts
provenance: {
  ...allUnavailable(totalAssets),
  frontEnd: {
    available: feByType.length > 0,
    serversCovered: feByType.length > 0 ? 1 : 0,
    serversTotal: 1,
  },
},
```

(Drop the now-unused `emptyFrontEnd` import if present.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/engines/aggregation/summaryView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/aggregation/summaryView.ts src/engines/aggregation/summaryView.test.ts
git commit -m "feat(frontEnd): discovered-only volumetry for PPDM summary exports"
```

---

### Task 4: NetWorker path

**Files:**
- Modify: `src/engines/products/networker/buildNetworkerView.ts`
- Modify: `src/engines/products/networker/buildNetworkerView.test.ts`

- [ ] **Step 1: Write the failing test** in `src/engines/products/networker/buildNetworkerView.test.ts`

```ts
it('maps Front End Capacity by Workload to protected FETB per type', () => {
  const view = buildNetworkerView(normalizeWorkbook(networkerWorkbookBuffer()))
  expect(view.frontEnd.byType.map((r) => r.type)).toEqual(['Filesystem', 'Oracle RMAN'])
  const fs = view.frontEnd.byType.find((r) => r.type === 'Filesystem')!
  expect(fs.protectedFetbGb).toBe(410)
  expect(fs.protectedDiscoveredGb).toBeUndefined()
  expect(fs.unprotectedFetbGb).toBeUndefined()
  expect(view.provenance.frontEnd.available).toBe(true)
})
```

(Confirm the file already imports `buildNetworkerView`, `normalizeWorkbook`, `networkerWorkbookBuffer`; add any missing import.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engines/products/networker/buildNetworkerView.test.ts`
Expected: FAIL — `frontEnd.byType` is empty.

- [ ] **Step 3: Implement** in `src/engines/products/networker/buildNetworkerView.ts`

The `workloadRows` variable already exists. After it, build the front-end value (reuse the existing `workloadRows`):

```ts
const frontEnd = {
  byType: workloadRows
    .filter((r) => cellNum(r, 'Front End Capacity (GB)') > 0)
    .map((r) => ({
      type: cellStr(r, 'Workload Type'),
      protectedFetbGb: cellNum(r, 'Front End Capacity (GB)'),
      protectedDiscoveredGb: undefined,
      unprotectedDiscoveredGb: undefined,
      unprotectedFetbGb: undefined,
    })),
  excludedCount: 0,
}
```

Replace `frontEnd: emptyFrontEnd()` in the returned object with `frontEnd,` (drop the unused `emptyFrontEnd` import).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/engines/products/networker/buildNetworkerView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/products/networker/buildNetworkerView.ts src/engines/products/networker/buildNetworkerView.test.ts
git commit -m "feat(frontEnd): map NetWorker workload front-end capacity to protected FETB"
```

---

### Task 5: Export section + i18n + Avamar suppression

**Files:**
- Modify: `src/engines/export/sectionOrder.ts`
- Modify: `src/engines/export/buildExportModel.ts`
- Modify: `src/i18n/locales/en/dashboard.json`
- Modify: `src/i18n/locales/fr/dashboard.json`
- Modify: `src/i18n/locales/de/dashboard.json`
- Modify: `src/i18n/locales/it/dashboard.json`
- Modify: `src/engines/export/buildExportModel.test.ts`

**Interfaces:**
- Consumes: `frontEnd` from `view`; `formatBytes`, `gbToBytes`, `formatGbOrUnknown`, `fmtInt`; private `provenanceCaveat`; `FRONT_END_METRICS` from `../aggregation/frontEnd`.
- Produces: `SectionId` adds `'volumetry'`; a `volumetry` section in the model.

- [ ] **Step 1: Add the `SectionId` + ordering** in `src/engines/export/sectionOrder.ts`

Add `| 'volumetry'` to the `SectionId` union. Insert `'volumetry'` into both arrays — in `assessment` immediately after `'exposure'`; in `ops` immediately before `'policies'`:

```ts
assessment: ['perServer', 'coverage', 'exposure', 'volumetry', 'idle', 'jobs', 'resilience', 'capacity', 'policies'],
ops: ['perServer', 'jobs', 'resilience', 'capacity', 'coverage', 'exposure', 'idle', 'volumetry', 'policies'],
```

- [ ] **Step 2: Add i18n keys to all four locales**

To `src/i18n/locales/en/dashboard.json` add a top-level `"volumetry"` object:

```json
"volumetry": {
  "title": "Front-end volumetry by workload",
  "col": {
    "type": "Workload type",
    "protectedDiscovered": "Protected · discovered",
    "protectedFetb": "Protected · FETB",
    "unprotectedDiscovered": "Unprotected · discovered",
    "unprotectedFetb": "Unprotected · FETB"
  },
  "total": "TOTAL",
  "excludedNote": "{{count}} excluded assets (e.g. templates, decommissioned) are not counted.",
  "partialNote": "≥ : some workloads report no figure for that column; the total is a floor.",
  "sizingNote": "Front-end input only — back-end capacity depends on change rate, retention and dedupe.",
  "takeaway": "Front-end FETB protected: {{fetb}}"
}
```

`fr/dashboard.json`:

```json
"volumetry": {
  "title": "Volumétrie front-end par charge de travail",
  "col": {
    "type": "Type de charge",
    "protectedDiscovered": "Protégé · découvert",
    "protectedFetb": "Protégé · FETB",
    "unprotectedDiscovered": "Non protégé · découvert",
    "unprotectedFetb": "Non protégé · FETB"
  },
  "total": "TOTAL",
  "excludedNote": "{{count}} actifs exclus (p. ex. modèles, mis hors service) ne sont pas comptés.",
  "partialNote": "≥ : certaines charges ne rapportent aucune valeur pour cette colonne ; le total est un plancher.",
  "sizingNote": "Donnée front-end uniquement — la capacité back-end dépend du taux de changement, de la rétention et de la déduplication.",
  "takeaway": "FETB front-end protégé : {{fetb}}"
}
```

`de/dashboard.json`:

```json
"volumetry": {
  "title": "Front-End-Volumetrie nach Workload",
  "col": {
    "type": "Workload-Typ",
    "protectedDiscovered": "Geschützt · erkannt",
    "protectedFetb": "Geschützt · FETB",
    "unprotectedDiscovered": "Ungeschützt · erkannt",
    "unprotectedFetb": "Ungeschützt · FETB"
  },
  "total": "GESAMT",
  "excludedNote": "{{count}} ausgeschlossene Assets (z. B. Vorlagen, außer Betrieb) werden nicht gezählt.",
  "partialNote": "≥ : Einige Workloads melden für diese Spalte keinen Wert; die Summe ist ein Mindestwert.",
  "sizingNote": "Nur Front-End-Eingabe — die Back-End-Kapazität hängt von Änderungsrate, Aufbewahrung und Deduplizierung ab.",
  "takeaway": "Front-End-FETB geschützt: {{fetb}}"
}
```

`it/dashboard.json`:

```json
"volumetry": {
  "title": "Volumetria front-end per tipo di workload",
  "col": {
    "type": "Tipo di workload",
    "protectedDiscovered": "Protetto · rilevato",
    "protectedFetb": "Protetto · FETB",
    "unprotectedDiscovered": "Non protetto · rilevato",
    "unprotectedFetb": "Non protetto · FETB"
  },
  "total": "TOTALE",
  "excludedNote": "{{count}} asset esclusi (es. modelli, dismessi) non sono conteggiati.",
  "partialNote": "≥ : alcuni workload non riportano alcun valore per questa colonna; il totale è un minimo.",
  "sizingNote": "Solo dato front-end — la capacità back-end dipende da tasso di variazione, retention e deduplica.",
  "takeaway": "FETB front-end protetto: {{fetb}}"
}
```

- [ ] **Step 3: Write the failing test** in `src/engines/export/buildExportModel.test.ts`

Use the existing test's translator/helper pattern (a passthrough `t` that returns the key, or the real `t` if the file already wires i18n — match the file). Two cases:

```ts
it('renders a volumetry section with a TOTAL row and ≥ floor for no-figure columns', () => {
  const view = baseView({
    frontEnd: {
      byType: [
        { type: 'Virtual Machines', protectedDiscoveredGb: 100, protectedFetbGb: 60, unprotectedDiscoveredGb: 30, unprotectedFetbGb: 3 },
        { type: 'SQL Databases', protectedDiscoveredGb: undefined, protectedFetbGb: 15, unprotectedDiscoveredGb: undefined, unprotectedFetbGb: 2 },
      ],
      excludedCount: 5,
    },
  })
  const model = buildExportModel(view, 'assessment', 'light', t, 'en')
  const sec = model.sections.find((s) => s.id === 'volumetry')!
  expect(sec.table!.rows.length).toBe(3) // 2 types + TOTAL
  const total = sec.table!.rows[2]
  expect(total[2]).toBe('75.0 GB') // protected FETB exact: 60 + 15
  expect(total[1].startsWith('≥')).toBe(true) // protected discovered: SQL missing → floor
  expect(sec.table!.caption).toContain('5') // excluded footnote
})

it('suppresses the volumetry section when there is no per-type data (Avamar)', () => {
  const view = baseView({ frontEnd: { byType: [], excludedCount: 0 } })
  const model = buildExportModel(view, 'assessment', 'light', t, 'en')
  expect(model.sections.find((s) => s.id === 'volumetry')).toBeUndefined()
})
```

> If the test file lacks a `baseView(over)` factory, add one mirroring the merge test's `detail()` helper (full `ReportView` with overrides). The `75.0 GB` literal assumes the passthrough `t` and `'en'` base-10 formatting (`formatBytes(75e9, 'en')`); if the file uses the real i18n `t`, keep the numeric expectation and adjust separators to match the locale.

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts`
Expected: FAIL — no `volumetry` section.

- [ ] **Step 5: Implement the section** in `src/engines/export/buildExportModel.ts`

Add `frontEnd` to the destructure on the `view` line:

```ts
const { coverage, gaps, jobs, compliance, capacity, policies, meta, idleAgents, frontEnd } = view
```

Import `FRONT_END_METRICS`:

```ts
import { FRONT_END_METRICS } from '../aggregation/frontEnd'
```

Before the `byId` record, build the section:

```ts
const feBytes = (gb: number) => formatBytes(gbToBytes(gb), locale)
const feCell = (gb: number | undefined) => formatGbOrUnknown(gb, locale, t('common:sizeUnknown'))
const feTotalCell = (k: (typeof FRONT_END_METRICS)[number]): string => {
  const defined = frontEnd.byType.filter((r) => r[k] !== undefined)
  if (defined.length === 0) return t('common:sizeUnknown')
  const sum = defined.reduce((acc, r) => acc + (r[k] as number), 0)
  const cell = feBytes(sum)
  return defined.length < frontEnd.byType.length ? `≥ ${cell}` : cell
}
const feHasPartial = FRONT_END_METRICS.some((k) => {
  const def = frontEnd.byType.filter((r) => r[k] !== undefined).length
  return def > 0 && def < frontEnd.byType.length
})
const feProtFetb = frontEnd.byType.reduce((a, r) => a + (r.protectedFetbGb ?? 0), 0)
const feUnprotDisc = frontEnd.byType.reduce((a, r) => a + (r.unprotectedDiscoveredGb ?? 0), 0)
const hasFrontEnd = frontEnd.byType.length > 0

const volumetrySection: ExportSection = {
  id: 'volumetry',
  title: t('dashboard:volumetry.title'),
  table: {
    columns: [
      t('dashboard:volumetry.col.type'),
      t('dashboard:volumetry.col.protectedDiscovered'),
      t('dashboard:volumetry.col.protectedFetb'),
      t('dashboard:volumetry.col.unprotectedDiscovered'),
      t('dashboard:volumetry.col.unprotectedFetb'),
    ],
    rows: [
      ...frontEnd.byType.map((r) => [
        r.type,
        feCell(r.protectedDiscoveredGb),
        feCell(r.protectedFetbGb),
        feCell(r.unprotectedDiscoveredGb),
        feCell(r.unprotectedFetbGb),
      ]),
      ...(hasFrontEnd
        ? [
            [
              t('dashboard:volumetry.total'),
              feTotalCell('protectedDiscoveredGb'),
              feTotalCell('protectedFetbGb'),
              feTotalCell('unprotectedDiscoveredGb'),
              feTotalCell('unprotectedFetbGb'),
            ],
          ]
        : []),
    ],
    caption: [
      frontEnd.excludedCount > 0
        ? t('dashboard:volumetry.excludedNote', { count: fmtInt(frontEnd.excludedCount, locale) })
        : '',
      feHasPartial ? t('dashboard:volumetry.partialNote') : '',
      t('dashboard:volumetry.sizingNote'),
      provenanceCaveat(view.provenance.frontEnd, t),
    ]
      .filter(Boolean)
      .join(' · '),
  },
  ...(hasFrontEnd
    ? {
        deck: {
          subtitle: t('dashboard:volumetry.takeaway', { fetb: feBytes(feProtFetb) }),
          kpiChips: [
            { label: t('dashboard:volumetry.col.protectedFetb'), value: feBytes(feProtFetb), tone: 'accent' as const },
            { label: t('dashboard:volumetry.col.unprotectedDiscovered'), value: feBytes(feUnprotDisc), tone: 'warn' as const },
          ],
        },
      }
    : {}),
}
```

Add it to the `byId` record:

```ts
volumetry: volumetrySection,
```

(When `byType` is empty: no rows, no `deck` → `isRenderable` returns false → the section is dropped and a `common:sectionUnavailable` caveat is added. No `withCaveat` wrapper is used.)

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts src/i18n/keyParity.test.ts`
Expected: PASS (both the new section tests and key-parity).

- [ ] **Step 7: Commit**

```bash
git add src/engines/export/sectionOrder.ts src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/i18n/locales/en/dashboard.json src/i18n/locales/fr/dashboard.json src/i18n/locales/de/dashboard.json src/i18n/locales/it/dashboard.json
git commit -m "feat(frontEnd): volumetry export section, totals, i18n, Avamar suppression"
```

---

### Task 6: PPTX table-first placement (`planSlides`)

Render `volumetry` as a full-width table slide in place (like `idle`), not a band pair, and not duplicated in the appendix — while preserving the existing `idle` placement.

**Files:**
- Modify: `src/engines/export/pptx/slidePlan.ts`
- Create: `src/engines/export/pptx/slidePlan.test.ts` (if absent; otherwise modify)

**Interfaces:**
- Consumes: `ExportSection`, `SlidePlanItem`.

- [ ] **Step 1: Write the failing test** in `src/engines/export/pptx/slidePlan.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { ExportSection } from '../types'
import { planSlides } from './slidePlan'

const sec = (id: string, withTable = false): ExportSection => ({
  id,
  title: id,
  ...(withTable ? { table: { columns: ['a'], rows: [['1']] } } : {}),
})

describe('planSlides', () => {
  it('renders volumetry as one in-place table slide, not paired, not in the appendix', () => {
    const plan = planSlides([sec('coverage'), sec('exposure'), sec('volumetry', true), sec('jobs')])
    const tableItems = plan.filter((p) => p.kind === 'table')
    expect(tableItems.length).toBe(1)
    expect(tableItems[0].kind === 'table' && tableItems[0].section.id).toBe('volumetry')
    // volumetry must appear before the jobs pair, i.e. not pushed to the trailing appendix
    const volIdx = plan.findIndex((p) => p.kind === 'table' && p.section.id === 'volumetry')
    const jobsIdx = plan.findIndex((p) => p.kind === 'pair' && (p.top.id === 'jobs' || p.bottom?.id === 'jobs'))
    expect(volIdx).toBeLessThan(jobsIdx)
  })

  it('still renders idle as a full-width single in place (regression)', () => {
    const plan = planSlides([sec('coverage'), sec('exposure'), sec('idle'), sec('jobs')])
    expect(plan.some((p) => p.kind === 'single' && p.section.id === 'idle')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engines/export/pptx/slidePlan.test.ts`
Expected: FAIL — volumetry currently pairs as a band and also appears in the appendix.

- [ ] **Step 3: Rewrite `planSlides`** in `src/engines/export/pptx/slidePlan.ts`

```ts
// src/engines/export/pptx/slidePlan.ts
import type { ExportSection } from '../types'

export type SlidePlanItem =
  | { kind: 'single'; section: ExportSection }
  | { kind: 'pair'; top: ExportSection; bottom?: ExportSection }
  | { kind: 'table'; section: ExportSection }

/** Section ids that render full-width in place (not band-paired, not in the appendix). */
const FULLWIDTH: Record<string, 'single' | 'table'> = { idle: 'single', volumetry: 'table' }

/**
 * Pair sections into band-slides. Full-width sections (`idle` → tiles single,
 * `volumetry` → table) are spliced in right after the pair holding the nearest
 * preceding non-full-width section (or at the front if none). Remaining sections
 * pair consecutively in order; any paired section with a table also gets a
 * trailing appendix table slide.
 */
export function planSlides(sections: ExportSection[]): SlidePlanItem[] {
  const fullwidth = sections
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.id in FULLWIDTH)
    .map(({ s, i }) => {
      let predecessorId: string | null = null
      for (let j = i - 1; j >= 0; j--) {
        if (!(sections[j].id in FULLWIDTH)) {
          predecessorId = sections[j].id
          break
        }
      }
      return { section: s, predecessorId, kind: FULLWIDTH[s.id] }
    })

  const rest = sections.filter((s) => !(s.id in FULLWIDTH))
  const pairs: SlidePlanItem[] = []
  for (let i = 0; i < rest.length; i += 2) {
    const top = rest[i]
    if (top === undefined) continue
    pairs.push({ kind: 'pair', top, bottom: rest[i + 1] })
  }

  const out: SlidePlanItem[] = [...pairs]
  for (const fw of fullwidth) {
    const item: SlidePlanItem =
      fw.kind === 'single'
        ? { kind: 'single', section: fw.section }
        : { kind: 'table', section: fw.section }
    if (fw.predecessorId === null) {
      out.unshift(item)
      continue
    }
    const at = out.findIndex(
      (p) => p.kind === 'pair' && (p.top.id === fw.predecessorId || p.bottom?.id === fw.predecessorId),
    )
    out.splice(at >= 0 ? at + 1 : out.length, 0, item)
  }

  const appendix: SlidePlanItem[] = sections
    .filter((s) => !(s.id in FULLWIDTH) && (s.table?.rows.length ?? 0) > 0)
    .map((s) => ({ kind: 'table', section: s }))

  return [...out, ...appendix]
}
```

(`buildPptx` already routes `kind: 'table'` → `drawTableSlide` and `kind: 'single'` → `drawIdle`; no builder change.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/engines/export/pptx/slidePlan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/export/pptx/slidePlan.ts src/engines/export/pptx/slidePlan.test.ts
git commit -m "feat(frontEnd): render volumetry as an in-place full-width table slide"
```

---

### Task 7: Docs + full verification

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the metric** — in `docs/ARCHITECTURE.md` §3 ("Domain engines" table), add a row:

```md
| `frontEnd.ts` | `inUse` sheet names + `RawWorkbook.sheets` | `FrontEnd` | Per-type discovered + FETB (licensed), split protected/unprotected; tri-state sizes (number / 0 / undefined-when-no-figure); EXCLUDED → `excludedCount` footnote. PPDM detail; summary fills discovered only; NetWorker maps workload capacity → protected FETB; Avamar → empty (suppressed). |
```

- [ ] **Step 2: Note the section + invariant** — in `CLAUDE.md`, under the data-flow / metrics description, add one line:

```md
- **Front-end volumetry** (`engines/aggregation/frontEnd.ts` → `ReportView.frontEnd`): per-workload-type front-end TB (discovered + FETB) split protected/unprotected, rendered table-first via a `planSlides` full-width special-case. Totals derived at render; sizes are size-optional ("–" when no figure).
```

- [ ] **Step 3: Run the full CI sequence**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all PASS (typecheck clean, Biome clean, all tests green incl. coverage gate + key-parity, build incl. supply-chain gate).

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md CLAUDE.md
git commit -m "docs(frontEnd): document the front-end volumetry metric and slide"
```

---

## Self-Review

**1. Spec coverage:**
- D1 metric (both) → Task 2 (`computeFrontEnd` sums both), Task 5 (4 columns). ✓
- D2 scope (protected/unprotected split, EXCLUDED footnote) → Task 2 (buckets + `excludedCount`), Task 5 (`excludedNote`). ✓
- D3 layout (table-first) → Task 6 (`planSlides` → table slide). ✓
- D4 totals (derived, `≥`/floor) → Task 5 (`feTotalCell`, `partialNote`). ✓
- D5 flavors (both) → Task 5 (`sectionOrder`). ✓
- Cross-product (§3): PPDM detail (Task 2), summary discovered-only + provenance override (Task 3), NetWorker → protected FETB (Task 4), Avamar empty → suppressed (Task 1 + Task 5 test). ✓
- Merge (§4) → Task 1 (`mergeFrontEnd`, single-view identity via early return). ✓
- Provenance MetricKey + `mergeProvenance` list (§3) → Task 1. ✓
- Render channels (§5): caveats in `table.caption`, totals in `deck.kpiChips`/TOTAL row → Task 5. ✓
- i18n parity (§7) → Task 5 (all four locales). ✓
- Tests (§8) → Tasks 1–6 each ship tests; coverage gate verified Task 7. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; every run step has an expected result. ✓

**3. Type consistency:** `FrontEnd`/`FrontEndTypeRow` field names (`protectedDiscoveredGb`, `protectedFetbGb`, `unprotectedDiscoveredGb`, `unprotectedFetbGb`, `excludedCount`) are identical across `computeFrontEnd`, `mergeFrontEnd`, `FRONT_END_METRICS`, the summary/NetWorker builders, and the export section. `computeFrontEnd(wb, inUse)` signature matches its call in `buildPpdmView`. `'volumetry'` is the section id everywhere (`sectionOrder`, `byId`, `planSlides`, tests). ✓
