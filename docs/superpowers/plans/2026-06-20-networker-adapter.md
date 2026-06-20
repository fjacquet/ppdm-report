# NetWorker Adapter (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `buildNetworkerView` adapter so Dell NetWorker Live Optics exports (e.g. NetWorker_170626.xlsx) produce a full report through the existing per-product pipeline.

**Architecture:** Phases 1–2 shipped the seam (RawWorkbook, detectProduct → already returns `'networker'`, the `engines/products/` registry, EstateDocument, ProductSection, size-optional gaps). NetWorker files are currently detected but rejected (`isSupportedProduct('networker')` is false). This phase adds the view-builder and registers it — purely additive: **no shared-type changes, no new i18n keys** (all metrics reuse existing keys; the `'networker'` ProductId/label already exist).

**Tech Stack:** React 19, TypeScript 5 (strict), Vite 6, Zustand 5, Vitest 3, Biome 2, i18next, ECharts, pptxgenjs.

## Global Constraints

- **Pure engines.** The adapter + helpers live under `src/engines/**`: no React/DOM/store imports, no `Date.now()`/`Math.random()`.
- **Additive — zero PPDM/Avamar behavior change.** The full existing suite (268 tests on branch `feat/networker-adapter`) must stay green after every task. Registering NetWorker must not alter PPDM or Avamar output.
- **Privacy / SheetJS pin / supply chain.** No network calls; no new dependencies; don't touch the `xlsx` CDN pin.
- **i18n parity.** No new strings are expected. If you do add any user-facing string, mirror it across en/fr/de/it (the `keyParity` test enforces identical key sets).
- **Coverage gate.** New `src/engines/**` code held to ≥75% lines/functions/branches/statements.
- **Test fixtures.** Synthetic in-memory workbooks via `makeWorkbook` only. **Never read the gitignored `ref/` directory** (CI ENOENT).
- **Biome style.** Single quotes, no semicolons, 2-space indent, 100-col. No unused imports/vars. **The RTK command-proxy hook mangles `npm run lint`/`npx biome`** — use `./node_modules/.bin/biome check .` for the real lint signal ("Checked N files … No fixes applied").
- **Real gates:** `npm run typecheck` (both app + test tsconfigs, exit 0), `npx vitest run` (full suite), `npm run build` (supply-chain gate). Harness LSP "Cannot find module" diagnostics are stale cache — trust the CLI.
- **Commit trailers.** Every commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01UNXq9BXAtjWU8K2DVjJmNv`.
- **Branch.** `feat/networker-adapter` (stacked on `feat/avamar-adapter`; will rebase down the stack as #11/#12 merge).

---

## File structure

**Created:**
- `src/engines/products/networker/buildNetworkerView.ts` — NetWorker `RawWorkbook → ReportView` + networker-local helpers.
- `src/engines/products/networker/buildNetworkerView.test.ts`

**Modified:**
- `src/engines/aggregation/provenance.ts` — add `networkerProvenance(assetsTotal)`.
- `src/test-helpers/workbooks.ts` — add `networkerWorkbookBuffer()`.
- `src/engines/products/index.ts` — register `networker: buildNetworkerView`.
- `src/engines/products/estateDocument.test.ts` — retag the skip-guard test's example `'networker'` → `'unknown'`; add a NetWorker-builds case.
- `src/hooks/useReportUpload.test.ts` — add a NetWorker-admitted test.
- `CLAUDE.md`, `docs/ARCHITECTURE.md` — note the NetWorker adapter.

---

## Task 1: `buildNetworkerView` + provenance helper + synthetic workbook + unit tests (not yet registered)

Build and unit-test the adapter in isolation. Do NOT register it (Task 2 flips that switch), so the suite stays green and this task is purely additive.

**Files:**
- Create: `src/engines/products/networker/buildNetworkerView.ts`, `src/engines/products/networker/buildNetworkerView.test.ts`
- Modify: `src/engines/aggregation/provenance.ts`, `src/test-helpers/workbooks.ts`

**Interfaces:**
- Consumes: `RawWorkbook`, `TOP_N_DEFAULT`, `FLAG_THRESHOLD_PCT` (`src/types/ppdm.ts`); `ReportView`, `StorageTarget`, `UnprotectedAsset`, `MetricKey`, `MetricProvenance` (`src/types/reportView.ts`); `cellStr`, `cellNum`, `countBy` (`src/engines/aggregation/rows.ts`); `emptyBand`, `finalizeBand` (`src/engines/aggregation/coverage.ts`); `makeWorkbook` (`src/test-helpers/workbooks.ts`); `normalizeWorkbook` (`src/engines/parser/normalizeWorkbook.ts`).
- Produces: `export function buildNetworkerView(wb: RawWorkbook): ReportView`; `export function networkerProvenance(assetsTotal: number): Record<MetricKey, MetricProvenance>`.

- [ ] **Step 1: Add `networkerProvenance` helper**

In `src/engines/aggregation/provenance.ts`, add (mirrors the existing `avamarProvenance`, but compliance is **available** for NetWorker):

```ts
/** Provenance for a single NetWorker server: count-based coverage (no per-type),
 *  but gaps, compliance (immutable/replication computed), and DD capacity are available. */
export function networkerProvenance(assetsTotal: number): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: false, serversCovered: 0, serversTotal: 1 },
    gapsList: { available: true, serversCovered: 1, serversTotal: 1 },
    compliance: {
      available: true,
      serversCovered: 1,
      serversTotal: 1,
      assetsCovered: assetsTotal,
      assetsTotal,
    },
    storageTargets: { available: true, serversCovered: 1, serversTotal: 1 },
  }
}
```

- [ ] **Step 2: Add the synthetic NetWorker workbook to test-helpers**

In `src/test-helpers/workbooks.ts`, add (mirrors NetWorker_170626.xlsx; `detectProduct` classifies it `'networker'` via the `Storage Nodes` + `Dedup Jobs` signature):

```ts
/**
 * Synthetic NETWORKER workbook (System Info, Clients, Jobs, Data Domains, Front
 * End Capacity by Workload, Policies, Devices Detailed, Backups, Dedup Jobs +
 * the Storage Nodes/Dedup Jobs detection signature), mirroring a Dell NetWorker
 * Live Optics export.
 */
export function networkerWorkbookBuffer(): ArrayBuffer {
  return makeWorkbook({
    Details: [
      ['Project Name', 'NW-test'],
      ['Date', 45000],
      ['Disclaimer #1', 'All measurements on the report are Base 10 calculations'],
    ],
    'System Info': [
      ['Metric', 'Value'],
      ['NetWorker Version', 'NetWorker 19.13.0.2'],
      ['Server Hostname', 'nw-host'],
    ],
    'Storage Nodes': [['Name'], ['nw-host']],
    'Dedup Jobs': [
      ['Hostname', 'Mtree Name'],
      ['nw-host', 'Index'],
      ['nw-host', 'Filesystem'],
      ['nw-host', 'Index'],
    ],
    Clients: [
      ['Hostname', 'Scheduled Backup', 'Backup Type'],
      ['c1', 'True', 'Filesystem'],
      ['c2', 'True', 'Oracle'],
      ['c3', 'False', 'Filesystem'],
    ],
    Jobs: [
      ['Completion Status'],
      ['Succeeded'],
      ['Succeeded'],
      ['Succeeded'],
      ['Failed'],
    ],
    'Data Domains': [
      ['Name', 'Model', 'Used Capacity (GB)', 'Total Capacity (GB)'],
      ['dd1', 'DD6400', 73000, 164000],
      ['dd2', 'DD9400', 90, 100],
    ],
    'Front End Capacity by Workload': [
      ['Workload Type', 'Front End Capacity (GB)'],
      ['Filesystem', 410],
      ['Oracle RMAN', 30598],
      ['SQL', 0],
      ['VMware', 0],
    ],
    Policies: [['Policy Name'], ['Bronze'], ['Bronze'], ['Silver']],
    'Devices Detailed': [
      ['Dev Name', 'DD Retention Lock Mode'],
      ['d1', 'None'],
      ['d2', 'Compliance'],
    ],
    Backups: [
      ['Backup Type', 'Backup Level', 'Clone Status'],
      ['Filesystem', 'Incr', 'N/A'],
      ['Oracle', 'Full', 'Cloned'],
      ['Filesystem', 'Full', 'N/A'],
    ],
  })
}
```

- [ ] **Step 3: Write the failing test**

Create `src/engines/products/networker/buildNetworkerView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { networkerWorkbookBuffer } from '../../../test-helpers/workbooks'
import { buildNetworkerView } from './buildNetworkerView'

const view = () => buildNetworkerView(normalizeWorkbook(networkerWorkbookBuffer()))

describe('buildNetworkerView', () => {
  it('reads meta (base-10 → baseTen true)', () => {
    const v = view()
    expect(v.meta.customer).toBe('NW-test')
    expect(v.meta.baseTen).toBe(true)
  })

  it('coverage: count-based from Clients Scheduled Backup, no by-type', () => {
    const c = view().coverage
    expect(c.overall.protected).toBe(2)
    expect(c.overall.unprotected).toBe(1)
    expect(c.overall.excluded).toBe(0)
    expect(c.overall.pct).toBeCloseTo(2 / 3, 6)
    expect(c.byType).toEqual({})
  })

  it('jobs: Completion Status distribution + success rate', () => {
    const j = view().jobs
    expect(j.counts).toEqual({ Succeeded: 3, Failed: 1 })
    expect(j.total).toBe(4)
    expect(j.successPct).toBeCloseTo(3 / 4, 6)
    expect(j.capped).toBe(false)
  })

  it('gaps: size-less unprotected-client list', () => {
    const g = view().gaps
    expect(g.count).toBe(1)
    expect(g.totalCapacityGb).toBeUndefined()
    expect(g.top.items).toEqual([{ name: 'c3', type: 'Filesystem', sizeGb: undefined }])
  })

  it('capacity: Data Domain Used/Total utilization, flag at >=80, distinct mtrees', () => {
    const cap = view().capacity
    expect(cap.targets).toHaveLength(2)
    expect(cap.targets[0]).toMatchObject({ name: 'dd1', type: 'DD6400', flagged: false })
    expect(cap.targets[0]?.utilizationPct).toBeCloseTo((73000 / 164000) * 100, 4)
    expect(cap.targets[1]).toMatchObject({ name: 'dd2', utilizationPct: 90, flagged: true })
    expect(cap.flagged.map((t) => t.name)).toEqual(['dd2'])
    expect(cap.mtreeCount).toBe(2)
  })

  it('inUse = workloads with capacity>0; idleAgents = workloads with capacity 0', () => {
    const v = view()
    expect(v.inUse).toEqual(['Filesystem', 'Oracle RMAN'])
    expect(v.idleAgents).toEqual(['SQL', 'VMware'])
  })

  it('policies = distinct Policy Name count', () => {
    const p = view().policies
    expect(p.count).toBe(2)
    expect(p.byPurpose).toEqual({})
    expect(p.perPolicy).toEqual([])
  })

  it('compliance: immutable from retention lock, replicated from clone status, level mix', () => {
    const c = view().compliance
    expect(c.immutableCount).toBe(1)
    expect(c.immutablePct).toBeCloseTo(1 / 2, 6)
    expect(c.replicatedCount).toBe(1)
    expect(c.replicatedPct).toBeCloseTo(1 / 3, 6)
    expect(c.appConsistentPct).toBe(0)
    expect(c.backupLevelMix).toEqual({ Incr: 1, Full: 2 })
    expect(c.windowSize).toBe(3)
  })

  it('provenance: coverageByType unavailable; gaps/compliance/storageTargets available', () => {
    const p = view().provenance
    expect(p.coverageByType.available).toBe(false)
    expect(p.gapsList.available).toBe(true)
    expect(p.compliance.available).toBe(true)
    expect(p.compliance.assetsTotal).toBe(3)
    expect(p.storageTargets.available).toBe(true)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/engines/products/networker/buildNetworkerView.test.ts`
Expected: FAIL — `buildNetworkerView` not found.

- [ ] **Step 5: Implement `buildNetworkerView`**

Create `src/engines/products/networker/buildNetworkerView.ts`:

```ts
import { FLAG_THRESHOLD_PCT, type RawWorkbook, TOP_N_DEFAULT } from '../../../types/ppdm'
import type { ReportView, StorageTarget, UnprotectedAsset } from '../../../types/reportView'
import { emptyBand, finalizeBand } from '../../aggregation/coverage'
import { networkerProvenance } from '../../aggregation/provenance'
import { cellNum, cellStr, countBy } from '../../aggregation/rows'

const rowsOf = (wb: RawWorkbook, sheet: string) => wb.sheets[sheet]?.rows ?? []

/** True when a cell value is a real, present value (not empty or 'N/A'). */
function isPresent(value: string): boolean {
  const v = value.trim().toUpperCase()
  return v !== '' && v !== 'N/A'
}

/** Count of distinct present values of `key` across a sheet's rows. */
function distinctCount(wb: RawWorkbook, sheet: string, key: string): number {
  const set = new Set<string>()
  for (const r of rowsOf(wb, sheet)) {
    const v = cellStr(r, key)
    if (isPresent(v)) set.add(v)
  }
  return set.size
}

/** NetWorker composition root: RawWorkbook → ReportView. Pure. MVP fidelity (see plan). */
export function buildNetworkerView(wb: RawWorkbook): ReportView {
  // coverage — scheduled-backup flag; no per-type, no excluded.
  const clientRows = rowsOf(wb, 'Clients')
  const protectedN = clientRows.filter((r) => cellStr(r, 'Scheduled Backup') === 'True').length
  const overall = finalizeBand({
    ...emptyBand(),
    protected: protectedN,
    unprotected: clientRows.length - protectedN,
    excluded: 0,
  })

  // jobs — Completion Status distribution; NetWorker-native bucket 'Succeeded'.
  const jobRows = rowsOf(wb, 'Jobs')
  const counts = countBy(jobRows, 'Completion Status')
  const jobsTotal = jobRows.length

  // gaps — unprotected clients (no scheduled backup), no per-asset size.
  const gapItems: UnprotectedAsset[] = clientRows
    .filter((r) => cellStr(r, 'Scheduled Backup') !== 'True')
    .map((r) => ({ name: cellStr(r, 'Hostname'), type: cellStr(r, 'Backup Type'), sizeGb: undefined }))
  const gapTop = gapItems.slice(0, TOP_N_DEFAULT)

  // capacity — real Data Domain utilization (Used / Total).
  const targets: StorageTarget[] = rowsOf(wb, 'Data Domains').map((r) => {
    const used = cellNum(r, 'Used Capacity (GB)')
    const total = cellNum(r, 'Total Capacity (GB)')
    const utilizationPct = total > 0 ? (used / total) * 100 : 0
    return {
      name: cellStr(r, 'Name'),
      type: cellStr(r, 'Model'),
      utilizationPct,
      flagged: utilizationPct >= FLAG_THRESHOLD_PCT,
    }
  })

  // workload types — present-with-capacity vs present-but-empty (mirrors PPDM agent split).
  const workloadRows = rowsOf(wb, 'Front End Capacity by Workload')
  const inUse = workloadRows
    .filter((r) => cellNum(r, 'Front End Capacity (GB)') > 0)
    .map((r) => cellStr(r, 'Workload Type'))
  const idleAgents = workloadRows
    .filter((r) => cellNum(r, 'Front End Capacity (GB)') === 0)
    .map((r) => cellStr(r, 'Workload Type'))

  // policies — distinct protection-policy count.
  const policyNames = new Set(
    rowsOf(wb, 'Policies').map((r) => cellStr(r, 'Policy Name')).filter(Boolean),
  )

  // compliance — computed from the signals NetWorker exposes (app-consistency is N/A).
  const deviceRows = rowsOf(wb, 'Devices Detailed')
  const immutableCount = deviceRows.filter((r) =>
    isPresent(cellStr(r, 'DD Retention Lock Mode')) &&
    cellStr(r, 'DD Retention Lock Mode').toUpperCase() !== 'NONE',
  ).length
  const backupRows = rowsOf(wb, 'Backups')
  const replicatedCount = backupRows.filter((r) => isPresent(cellStr(r, 'Clone Status'))).length
  const windowSize = backupRows.length
  const deviceTotal = deviceRows.length

  return {
    meta: wb.meta,
    inUse,
    idleAgents,
    warnings: wb.warnings,
    coverage: { byType: {}, overall },
    gaps: {
      count: gapItems.length,
      totalCapacityGb: undefined,
      top: { items: gapTop, total: gapItems.length, shown: gapTop.length },
    },
    jobs: {
      counts,
      total: jobsTotal,
      successPct: jobsTotal > 0 ? (counts.Succeeded ?? 0) / jobsTotal : 0,
      capped: wb.sheets.Jobs?.capped ?? false,
      windowSize: jobsTotal,
    },
    compliance: {
      appConsistentPct: 0,
      immutablePct: deviceTotal > 0 ? immutableCount / deviceTotal : 0,
      replicatedPct: windowSize > 0 ? replicatedCount / windowSize : 0,
      appConsistentCount: 0,
      immutableCount,
      replicatedCount,
      backupLevelMix: countBy(backupRows, 'Backup Level'),
      windowSize,
      capped: wb.sheets.Backups?.capped ?? false,
    },
    capacity: {
      targets,
      flagged: targets.filter((t) => t.flagged),
      mtreeCount: distinctCount(wb, 'Dedup Jobs', 'Mtree Name'),
    },
    policies: { count: policyNames.size, byPurpose: {}, perPolicy: [] },
    provenance: networkerProvenance(windowSize),
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/engines/products/networker/buildNetworkerView.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Typecheck, suite, lint**

Run: `npm run typecheck` → exit 0. `npx vitest run` → all green (additive; nothing imports `buildNetworkerView` yet). `./node_modules/.bin/biome check .` → clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(networker): buildNetworkerView adapter + synthetic fixture (not yet registered)"
```

---

## Task 2: Register NetWorker + integration

Flip the switch: register the builder so upload admits NetWorker and the document/UI/export light up. Fix the skip-guard test (its unbuilt-product example is `'networker'`, now built → retag to `'unknown'`).

**Files:**
- Modify: `src/engines/products/index.ts`, `src/engines/products/estateDocument.test.ts`, `src/hooks/useReportUpload.test.ts`

**Interfaces:**
- Consumes: `buildNetworkerView` (Task 1), `getViewBuilder`/`isSupportedProduct` (`src/engines/products/index.ts`), `networkerWorkbookBuffer` (Task 1), `normalizeWorkbook`.

- [ ] **Step 1: Register the NetWorker builder**

In `src/engines/products/index.ts`, import and register:

```ts
import { buildNetworkerView } from './networker/buildNetworkerView'
// …
const BUILDERS: Partial<Record<ProductId, ViewBuilder>> = {
  ppdm: buildPpdmView,
  avamar: buildAvamarView,
  networker: buildNetworkerView,
}
```

- [ ] **Step 2: Run the suite to see the skip-guard test break**

Run: `npx vitest run src/engines/products/estateDocument.test.ts`
Expected: the "skips a recognized-but-unbuilt product without crashing the document" test now FAILS — it tagged a workbook `product: 'networker'` expecting a skip, but `'networker'` now has a builder. This confirms the registration took effect.

- [ ] **Step 3: Fix the skip-guard test + add a NetWorker-builds case**

In `src/engines/products/estateDocument.test.ts`, change the skip-guard test's tag from `'networker'` to `'unknown'` (the only remaining product with no builder; `getViewBuilder('unknown')` returns `undefined` → still skipped):

```ts
it('skips a recognized-but-unbuilt product without crashing the document', () => {
  // 'unknown' has no registered builder → skipped; document must not crash.
  const doc = buildEstateDocument([
    ppdmServer('a'),
    { label: 'x', product: 'unknown', workbook: normalizeWorkbook(detailWorkbookBuffer()) },
  ])
  expect(doc.products.map((p) => p.product)).toEqual(['ppdm'])
})
```

Add a new case proving NetWorker builds (import `networkerWorkbookBuffer` from `../../test-helpers/workbooks` if not already imported):

```ts
it('builds a NetWorker server into its own product section', () => {
  const doc = buildEstateDocument([
    { label: 'nw', product: 'networker', workbook: normalizeWorkbook(networkerWorkbookBuffer()) },
  ])
  expect(doc.products.map((p) => p.product)).toEqual(['networker'])
  expect(doc.products[0]?.estate.combined.coverage.overall.protected).toBe(2)
})
```

- [ ] **Step 4: Add an upload-admits-NetWorker test**

In `src/hooks/useReportUpload.test.ts`, mirror the existing Avamar admit-test (read the file to match its `parseInWorker` mock mechanism). Resolve `normalizeWorkbook(networkerWorkbookBuffer())` for the NetWorker file and assert it is stored with `product: 'networker'` and no error:

```ts
it('admits a NetWorker workbook (now a supported product)', async () => {
  const nw = normalizeWorkbook(networkerWorkbookBuffer())
  mockedParseInWorker.mockResolvedValueOnce(nw) // adapt to this file's mock variable
  const { result } = renderHook(() => useReportUpload())
  await act(async () => {
    await result.current.upload([new File(['x'], 'nw.xlsx')])
  })
  expect(useReportStore.getState().servers).toHaveLength(1)
  expect(useReportStore.getState().servers[0]?.product).toBe('networker')
  expect(result.current.error).toBeNull()
})
```

Adapt the mock mechanism and imports (`normalizeWorkbook`, `networkerWorkbookBuffer`, `act`, `renderHook`, `useReportStore`) to match the existing file's Avamar test.

- [ ] **Step 5: Typecheck, full suite, build**

Run: `npm run typecheck` → exit 0.
Run: `npx vitest run` → all green (skip-guard fixed; new NetWorker cases pass).
Run: `./node_modules/.bin/biome check .` → clean.
Run: `npm run build` → success, `check-supply-chain: OK`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(networker): register adapter; integration tests"
```

---

## Task 3: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/ARCHITECTURE.md`

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, update the product-adapter-registry bullet: the registry now has **PPDM, Avamar, and NetWorker** (all three `ProductId`s with builders); none are "phase N pending" anymore. Add a short NetWorker MVP-shape note: count-based coverage from the `Scheduled Backup` flag; Completion-Status job distribution; **real Data Domain capacity** (Used/Total utilization, flag at ≥80) + distinct-mtree count; workload-type inUse/idle from `Front End Capacity by Workload` (>0 vs =0); distinct-policy-count policies; **computed compliance** (immutability from `DD Retention Lock Mode`, replication from `Clone Status`, backup-level mix; app-consistency N/A → renders 0%); base-10 units.

- [ ] **Step 2: Update docs/ARCHITECTURE.md**

Run: `/usr/bin/grep -n 'product-adapter\|buildAvamarView\|buildPpdmView\|registry' docs/ARCHITECTURE.md`
Add `buildNetworkerView` alongside the others in the registry description and a short NetWorker mapping note mirroring §3's per-product sub-sections. State the registry now covers all three detected products; nothing remains "phase 3 pending".

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md
git commit -m "docs: NetWorker adapter in CLAUDE.md and ARCHITECTURE"
```

---

## Self-Review

**1. Spec coverage** (against the locked NetWorker decisions + the multi-product design):
- meta (base-10) → Task 1. ✅
- count-based coverage from Scheduled Backup, no by-type → Task 1. ✅
- jobs Completion-Status distribution + success rate → Task 1. ✅
- size-less gaps from unprotected clients (reuses phase-2 optional contract) → Task 1. ✅
- real DD capacity (Used/Total) + flag + distinct mtrees → Task 1. ✅
- workload inUse/idle from Front End Capacity by Workload → Task 1. ✅
- distinct-policy-count policies → Task 1. ✅
- computed compliance (immutable from retention lock, replicated from clone status, level mix; app-consistent N/A=0) → Task 1. ✅
- provenance: coverageByType unavailable; gaps/compliance/storageTargets available → Task 1 (`networkerProvenance`). ✅
- register → upload admits → document/UI/export → Task 2. ✅
- skip-guard retag networker→unknown → Task 2. ✅
- docs → Task 3. ✅
- No shared-type change / no new i18n key needed (verified: gaps already optional, compliance fields exist, `'networker'` label + detection exist). ✅

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code; the one adaptation note (useReportUpload mock variable) names exactly what to match and the invariant assertion.

**3. Type consistency:** `buildNetworkerView(wb: RawWorkbook): ReportView`; `networkerProvenance(assetsTotal: number): Record<MetricKey, MetricProvenance>`; `StorageTarget`/`UnprotectedAsset`/`Compliance` shapes match `src/types/reportView.ts`; helper names (`cellStr`/`cellNum`/`countBy`, `emptyBand`/`finalizeBand`, `TOP_N_DEFAULT`/`FLAG_THRESHOLD_PCT`) match their modules. No drift.

## Known limitations (recorded; not fixed here)

- **app-consistency renders as 0%.** Per the locked decision, NetWorker app-consistency is N/A but the `Compliance` struct + shared `JobsComplianceSection` render it as a 0% bar (same silent-zero class as the existing deferred compliance-bars follow-up). Documented; a future polish could gate per-sub-metric.
- **Mixed compliance denominators.** `immutablePct` is device-based (`Devices Detailed`) while `replicatedPct`/`backupLevelMix`/`windowSize` are backup-based (`Backups`). Both answer "is X configured" (0 = no); the `windowSize` caveat reflects the backup base.
- **Server label/version.** `deriveLabel`/`appVersion` are PPDM-specific (read the `System Information` sheet NetWorker lacks), so a NetWorker server's label falls back to the project name and version is ''. NetWorker's identity lives in `System Info` (`Server Hostname`/`NetWorker Version`); wiring that into the shared helpers is a future polish, intentionally out of scope.
