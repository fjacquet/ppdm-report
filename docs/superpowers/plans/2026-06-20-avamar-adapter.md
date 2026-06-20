# Avamar Adapter (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `buildAvamarView` adapter so Dell Avamar Live Optics exports (e.g. CRAMIF.xlsx) produce a full report through the existing per-product pipeline, with honest provenance N/A for what Avamar exports don't carry.

**Architecture:** Phase 1 already shipped the seam (product-neutral `RawWorkbook`, `detectProduct` → `'avamar'`, the `engines/products/` registry, `buildEstateDocument`, `ProductSection`). Avamar files are currently *detected but rejected* (`isSupportedProduct('avamar')` is false). This phase adds the Avamar view-builder, registers it (which lights up upload → store → document → UI → export automatically), and makes one supporting contract change: gaps entries become size-optional, because Avamar's unprotected-client list has no per-asset sizes.

**Tech Stack:** React 19, TypeScript 5 (strict), Vite 6, Zustand 5, Vitest 3, Biome 2, i18next, ECharts, pptxgenjs.

## Global Constraints

- **Pure engines.** New code under `src/engines/**` (the adapter, helpers) has no React/DOM/store imports and no `Date.now()`/`Math.random()`.
- **Zero PPDM behavior change.** The full existing suite (254 tests on branch `feat/avamar-adapter`) must stay green after every task. PPDM detail and summary outputs must be byte-identical — the gaps-size-optional change must be a pure widening (PPDM always provides sizes, so every `=== undefined` branch is dead for PPDM).
- **Privacy.** No network calls; the worker imports `../../privacy/fetchGuard` first.
- **SheetJS pin & supply chain.** Do not `npm install xlsx`; add no dependencies (the supply-chain gate fails otherwise).
- **i18n parity.** Any new/changed user-facing string in `src/i18n/locales/en/*.json` must be mirrored in `fr`, `de`, `it` (the `keyParity` test enforces identical key sets).
- **Coverage gate.** New `src/engines/**` code held to ≥75% lines/functions/branches/statements.
- **Test fixtures.** Synthetic in-memory workbooks via `makeWorkbook` in `src/test-helpers/workbooks.ts` only. **Never read the gitignored `ref/` directory** (CI ENOENT).
- **Biome style.** Single quotes, no semicolons, 2-space indent, 100-col. No unused imports/vars. **The RTK command-proxy hook mangles `npm run lint`/`npx biome`** — use `./node_modules/.bin/biome check .` for the real lint signal ("Checked N files … No fixes applied").
- **Real gates:** `npm run typecheck` (both app + test tsconfigs, exit 0), `npx vitest run` (full suite), `npx vitest run src/i18n/keyParity.test.ts` (parity), `npm run build` (supply-chain gate). Harness LSP "Cannot find module"/"toBeInTheDocument" diagnostics are stale cache — trust the CLI gates.
- **Commit trailers.** Every commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01UNXq9BXAtjWU8K2DVjJmNv`.
- **Branch.** `feat/avamar-adapter` (already created off `feat/multi-product-support`; will rebase onto `main` once PR #11 merges).

---

## File structure

**Created:**
- `src/engines/products/avamar/buildAvamarView.ts` — Avamar `RawWorkbook → ReportView` + small avamar-local extraction helpers.
- `src/engines/products/avamar/buildAvamarView.test.ts`

**Modified:**
- `src/types/reportView.ts` — `UnprotectedAsset.sizeGb` and `Gaps.totalCapacityGb` become optional (`?: number`).
- `src/utils/format.ts` — add `formatGbOrUnknown(gb, locale, unknown)` helper.
- `src/components/dashboard/GapsSection.tsx`, `ExecutiveKpis.tsx`, `PerServerSection.tsx` — handle absent size.
- `src/engines/aggregation/mergeViews.ts` — gaps merge tolerates absent size.
- `src/engines/export/buildExportModel.ts` — gaps export handles absent size.
- `src/engines/aggregation/provenance.ts` — add `avamarProvenance()`.
- `src/engines/products/index.ts` — register `avamar: buildAvamarView`.
- `src/test-helpers/workbooks.ts` — add `avamarWorkbookBuffer()`.
- `src/engines/products/estateDocument.test.ts` — the skip-guard test switches its unbuilt-product example from `'avamar'` to `'networker'`.
- `src/i18n/locales/{en,fr,de,it}/common.json` — add `sizeUnknown`.
- `src/i18n/locales/{en,fr,de,it}/dashboard.json` — generalize `provenance.unavailable` wording.
- `CLAUDE.md`, `docs/ARCHITECTURE.md` — note the Avamar adapter.

---

## Task 1: Gaps size-optional contract change (PPDM-identical widening)

Avamar lists unprotected *clients* with no per-asset size. Make gaps size fields optional and teach every consumer to render "size unknown" instead of a misleading `0 B`. PPDM always sets numeric sizes, so this is a pure widening — its behavior must not change.

**Files:**
- Modify: `src/types/reportView.ts`, `src/utils/format.ts`, `src/components/dashboard/GapsSection.tsx`, `src/components/dashboard/ExecutiveKpis.tsx`, `src/components/dashboard/PerServerSection.tsx`, `src/engines/aggregation/mergeViews.ts`, `src/engines/export/buildExportModel.ts`
- Modify (i18n): `src/i18n/locales/{en,fr,de,it}/common.json`
- Test: `src/utils/format.test.ts`

**Interfaces:**
- Produces: `UnprotectedAsset.sizeGb?: number`; `Gaps.totalCapacityGb?: number`; `export function formatGbOrUnknown(gb: number | undefined, locale: string, unknown: string): string`.

- [ ] **Step 1: Make the type fields optional**

In `src/types/reportView.ts`, change the two fields:

```ts
export interface UnprotectedAsset {
  name: string
  type: string
  sizeGb?: number
}
```

and in `Gaps`:

```ts
export interface Gaps {
  count: number
  totalCapacityGb?: number
  top: TopList<UnprotectedAsset>
}
```

- [ ] **Step 2: Write the failing test for the format helper**

In `src/utils/format.test.ts`, add:

```ts
import { formatGbOrUnknown } from './format'

describe('formatGbOrUnknown', () => {
  it('formats a number as bytes', () => {
    expect(formatGbOrUnknown(1, 'en', 'Size unknown')).toBe(formatBytes(gbToBytes(1), 'en'))
  })
  it('returns the unknown label when undefined', () => {
    expect(formatGbOrUnknown(undefined, 'en', 'Size unknown')).toBe('Size unknown')
  })
})
```

(Ensure `formatBytes` and `gbToBytes` are imported in this test file — they already are if other tests use them; add to the existing import from `./format` if missing.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/utils/format.test.ts`
Expected: FAIL — `formatGbOrUnknown` is not exported.

- [ ] **Step 4: Implement the helper**

In `src/utils/format.ts`, add (near `formatBytes`/`gbToBytes`):

```ts
/** Bytes for a GB value, or the supplied "unknown" label when the size is absent. */
export function formatGbOrUnknown(gb: number | undefined, locale: string, unknown: string): string {
  return gb === undefined ? unknown : formatBytes(gbToBytes(gb), locale)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/utils/format.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the `sizeUnknown` i18n key to all four locales**

Add a top-level key `sizeUnknown` to `src/i18n/locales/<locale>/common.json`:
- en: `"sizeUnknown": "Size unknown"`
- fr: `"sizeUnknown": "Taille inconnue"`
- de: `"sizeUnknown": "Größe unbekannt"`
- it: `"sizeUnknown": "Dimensione sconosciuta"`

- [ ] **Step 7: Update `mergeViews` gaps merge to tolerate absent size**

In `src/engines/aggregation/mergeViews.ts`:

Change the gaps top-N key (line ~69) from `(a) => a.sizeGb` to `(a) => a.sizeGb ?? 0`:

```ts
  const gapTop = topN(gapItems, TOP_N_DEFAULT, (a) => a.sizeGb ?? 0)
```

Change the merged `totalCapacityGb` (line ~85) so an all-absent set stays absent:

```ts
      totalCapacityGb: views.every((v) => v.gaps.totalCapacityGb === undefined)
        ? undefined
        : sum(views.map((v) => v.gaps.totalCapacityGb ?? 0)),
```

(PPDM views always set numeric `totalCapacityGb`, so this yields the same numeric sum as before.)

- [ ] **Step 8: Update `ExecutiveKpis` and `PerServerSection`**

In `src/components/dashboard/ExecutiveKpis.tsx`, replace line 16:

```ts
  const unprotectedValue = formatGbOrUnknown(
    view.gaps.totalCapacityGb,
    locale,
    t('kpi.sizeUnknown', { defaultValue: '' }) || '—',
  )
```

Simpler and consistent: import the common namespace. Change the hook to `const { t, i18n } = useTranslation(['dashboard', 'common'])` and use:

```ts
  const unprotectedValue = formatGbOrUnknown(view.gaps.totalCapacityGb, locale, t('common:sizeUnknown'))
```

Add the import: `import { formatGbOrUnknown } from '../../utils/format'` (keep the existing `formatBytes`/`gbToBytes` import only if still used — `gbToBytes`/`formatBytes` are no longer needed here, remove them to satisfy noUnusedImports).

In `src/components/dashboard/PerServerSection.tsx` line ~72, replace `formatBytes(gbToBytes(s.view.gaps.totalCapacityGb), locale)` with:

```tsx
{formatGbOrUnknown(s.view.gaps.totalCapacityGb, locale, t('common:sizeUnknown'))}
```

Ensure `PerServerSection` imports `formatGbOrUnknown` and has the `common` namespace available via its `useTranslation` call (add `'common'` to the namespace array if it uses a single namespace; verify the existing `t`/`i18n` destructure). Remove now-unused `formatBytes`/`gbToBytes` imports if they become unused.

- [ ] **Step 9: Update `GapsSection` — KPI, decouple table from bars, size cell**

In `src/components/dashboard/GapsSection.tsx`:

Replace the `totalBytes` line and the unprotected KPI value. Remove `const totalBytes = gbToBytes(view.gaps.totalCapacityGb)` and render the KPI as:

```tsx
<p className="text-3xl font-bold text-red-500">
  {formatGbOrUnknown(view.gaps.totalCapacityGb, locale, t('common:sizeUnknown'))}
</p>
```

Build bars only from sized items (so Avamar's size-less items produce no bar chart):

```ts
const barData: BarDatum[] = useMemo(
  () =>
    top.items
      .filter((a) => a.sizeGb !== undefined)
      .slice(0, 10)
      .map((a) => ({
        label: a.name,
        value: a.sizeGb as number,
        valueText: formatBytes(gbToBytes(a.sizeGb as number), locale),
        color: palette.bad,
      })),
  [top.items, locale, palette],
)
```

Decouple the detail table from the chart. Replace the single `{barData.length > 0 && (<> <Chart/> <Details>…</Details> </>)}` block with two separate blocks:

```tsx
{barData.length > 0 && (
  <Chart
    option={barOption}
    dark={dark}
    testId="gaps-bars"
    style={{ minHeight: barHeight, width: '100%' }}
  />
)}
{top.items.length > 0 && (
  <Details summary={t('common:showDetails')}>
    {/* …existing table… */}
  </Details>
)}
```

In the table's size cell (line ~96), render the unknown label when the size is absent:

```tsx
<td className="py-1.5 text-right">
  {formatGbOrUnknown(item?.sizeGb, locale, t('common:sizeUnknown'))}
</td>
```

Add `import { formatGbOrUnknown } from '../../utils/format'` (keep `formatBytes`/`gbToBytes` — still used by the bars).

- [ ] **Step 10: Update `buildExportModel` gaps**

In `src/engines/export/buildExportModel.ts`:

Exec KPI (line ~106) and gaps KPI (line ~193) unprotected value:

```ts
value: formatGbOrUnknown(gaps.totalCapacityGb, locale, t('common:sizeUnknown')),
```

Gaps table rows (line ~204):

```ts
rows: gaps.top.items.map((a) => [a.name, a.type, formatGbOrUnknown(a.sizeGb, locale, t('common:sizeUnknown'))]),
```

Deck bars (line ~210) — only sized items:

```ts
bars: toBars(
  gaps.top.items
    .filter((a) => a.sizeGb !== undefined)
    .slice(0, 10)
    .map((a) => ({
      label: a.name,
      magnitude: a.sizeGb as number,
      value: formatBytes(gbToBytes(a.sizeGb as number), locale),
      tone: 'bad' as const,
    })),
  pal,
),
```

Add `formatGbOrUnknown` to the existing `../../utils/format` import.

- [ ] **Step 11: Typecheck, full suite, parity, lint**

Run: `npm run typecheck`
Expected: exit 0 (both tsconfigs). Fix any remaining `number | undefined` type errors at consumer sites per the patterns above.

Run: `npx vitest run`
Expected: all green, same count as before plus the 2 new `formatGbOrUnknown` tests. PPDM assertions unchanged.

Run: `npx vitest run src/i18n/keyParity.test.ts` → PASS.
Run: `./node_modules/.bin/biome check .` → "No fixes applied".

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(gaps): size-optional gaps entries (render 'size unknown', not 0)"
```

---

## Task 2: `buildAvamarView` + synthetic workbook + unit tests (not yet registered)

Build the adapter and test it in isolation. Do NOT register it yet (Task 3 flips that switch), so the suite stays green and this task is purely additive.

**Files:**
- Create: `src/engines/products/avamar/buildAvamarView.ts`, `src/engines/products/avamar/buildAvamarView.test.ts`
- Modify: `src/engines/aggregation/provenance.ts` (add `avamarProvenance`), `src/test-helpers/workbooks.ts` (add `avamarWorkbookBuffer`)

**Interfaces:**
- Consumes: `RawWorkbook` (`src/types/ppdm.ts`), `ReportView` (`src/types/reportView.ts`), `cellStr`/`cellNum` (`src/engines/aggregation/rows.ts`), `emptyBand`/`finalizeBand` (`src/engines/aggregation/coverage.ts`), `TOP_N_DEFAULT`/`FLAG_THRESHOLD_PCT` (`src/types/ppdm.ts`), `formatGbOrUnknown` not needed here.
- Produces: `export function buildAvamarView(wb: RawWorkbook): ReportView`; `export function avamarProvenance(): Record<MetricKey, MetricProvenance>`.

- [ ] **Step 1: Add `avamarProvenance` helper**

In `src/engines/aggregation/provenance.ts`, add:

```ts
/** Provenance for a single Avamar server: count-based coverage + node capacity available;
 *  per-type coverage and copy compliance are not in Avamar exports. */
export function avamarProvenance(): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: false, serversCovered: 0, serversTotal: 1 },
    gapsList: { available: true, serversCovered: 1, serversTotal: 1 },
    compliance: { available: false, serversCovered: 0, serversTotal: 1, assetsCovered: 0, assetsTotal: 0 },
    storageTargets: { available: true, serversCovered: 1, serversTotal: 1 },
  }
}
```

- [ ] **Step 2: Add the synthetic Avamar workbook to test-helpers**

In `src/test-helpers/workbooks.ts`, add (mirrors CRAMIF.xlsx; `detectProduct` classifies it `'avamar'` via the `Avamar DPN Summary` sheet):

```ts
/**
 * Synthetic AVAMAR workbook (Backup Completion Summary, NonRetired/Retired
 * client counts, Clients No Backups, Backup Plugins, Node Utilization, Disabled
 * Groups, Group Summary), mirroring a Dell Avamar Live Optics export.
 */
export function avamarWorkbookBuffer(): ArrayBuffer {
  return makeWorkbook({
    Details: [
      ['Project Name', 'AVA-test'],
      ['Date', 45000],
      ['Disclaimer', 'All measurements ... Base 2 units of Measurement.'],
    ],
    'Host Info': [
      ['Hostname', 'Serial'],
      ['ava-host', 'SN1'],
    ],
    'Avamar DPN Summary': [['Server', 'Host', 'Status'], ['ava-host', 'h1', 'Activity completed successfully.']],
    'Backup Completion Summary': [
      ['Total', 'Successful', 'Exception', 'Failed'],
      [10, 7, 1, 2],
    ],
    'NonRetired Clients With Backups': [
      ['Has Backups', 'Total'],
      ['False', 4],
      ['True', 6],
    ],
    'Retired Clients With Backups': [
      ['Has Backups', 'Total'],
      ['False', 2],
      ['True', 1],
    ],
    'Clients No Backups': [
      ['Full Domain', 'Client Type', 'Completed Time'],
      ['/clients/a', 'REGULAR', 25569],
      ['/clients/b', 'VREGULAR', 25569],
    ],
    'Backup Plugins': [
      ['Plugin Name', 'Count'],
      ['Linux VMware Image', 5],
      ['No Plug-in', 0],
    ],
    'Node Utilization': [
      ['Date', 'Node', 'Max Utilization (%)'],
      [45000, 0, 0.5],
      [45001, 0, 0.8],
    ],
    'Disabled Groups': [
      ['Domain', 'Name', 'Read Only'],
      ['/', 'Default Group', 'False'],
      ['/dc1', 'Default Virtual Machine Group', 'False'],
    ],
    'Group Summary': [
      ['Group Name', 'Total', 'Successful', 'Exception', 'Failed'],
      ['G1', 2, 2, 0, 0],
      ['G1', 2, 2, 0, 0],
      ['G2', 1, 1, 0, 0],
    ],
  })
}
```

- [ ] **Step 3: Write the failing test for `buildAvamarView`**

Create `src/engines/products/avamar/buildAvamarView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarWorkbookBuffer } from '../../../test-helpers/workbooks'
import { buildAvamarView } from './buildAvamarView'

const view = () => buildAvamarView(normalizeWorkbook(avamarWorkbookBuffer()))

describe('buildAvamarView', () => {
  it('reads meta (base-2 → baseTen false)', () => {
    const v = view()
    expect(v.meta.customer).toBe('AVA-test')
    expect(v.meta.baseTen).toBe(false)
  })

  it('count-based coverage: protected/unprotected from NonRetired, excluded from Retired', () => {
    const c = view().coverage
    expect(c.overall.protected).toBe(6)
    expect(c.overall.unprotected).toBe(4)
    expect(c.overall.excluded).toBe(3)
    expect(c.overall.pct).toBeCloseTo(6 / 10, 6)
    expect(c.overall.pctInclExcluded).toBeCloseTo(6 / 13, 6)
    expect(c.byType).toEqual({})
  })

  it('jobs: Avamar-native buckets, success excludes exception+failed', () => {
    const j = view().jobs
    expect(j.counts).toEqual({ SUCCESS: 7, EXCEPTION: 1, FAILED: 2 })
    expect(j.total).toBe(10)
    expect(j.successPct).toBeCloseTo(7 / 10, 6)
    expect(j.capped).toBe(false)
  })

  it('gaps: size-less unprotected-client list', () => {
    const g = view().gaps
    expect(g.count).toBe(2)
    expect(g.totalCapacityGb).toBeUndefined()
    expect(g.top.items).toEqual([
      { name: '/clients/a', type: 'REGULAR', sizeGb: undefined },
      { name: '/clients/b', type: 'VREGULAR', sizeGb: undefined },
    ])
  })

  it('capacity: latest-date node utilization, mtreeCount 0', () => {
    const cap = view().capacity
    expect(cap.targets).toEqual([
      { name: 'Avamar node 0', type: 'Avamar grid node', utilizationPct: 0.8, flagged: false },
    ])
    expect(cap.mtreeCount).toBe(0)
    expect(cap.flagged).toEqual([])
  })

  it('inUse = plugins with count>0; idleAgents = disabled groups (domain-disambiguated)', () => {
    const v = view()
    expect(v.inUse).toEqual(['Linux VMware Image'])
    expect(v.idleAgents).toEqual(['Default Group', 'Default Virtual Machine Group (/dc1)'])
  })

  it('policies = distinct group count only', () => {
    const p = view().policies
    expect(p.count).toBe(2)
    expect(p.byPurpose).toEqual({})
    expect(p.perPolicy).toEqual([])
  })

  it('compliance is empty and provenance marks the right metrics', () => {
    const v = view()
    expect(v.compliance.windowSize).toBe(0)
    expect(v.compliance.immutablePct).toBe(0)
    expect(v.provenance.coverageByType.available).toBe(false)
    expect(v.provenance.gapsList.available).toBe(true)
    expect(v.provenance.compliance.available).toBe(false)
    expect(v.provenance.storageTargets.available).toBe(true)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/engines/products/avamar/buildAvamarView.test.ts`
Expected: FAIL — `buildAvamarView` not found.

- [ ] **Step 5: Implement `buildAvamarView`**

Create `src/engines/products/avamar/buildAvamarView.ts`:

```ts
import { FLAG_THRESHOLD_PCT, type RawWorkbook, TOP_N_DEFAULT } from '../../../types/ppdm'
import type { ReportView, StorageTarget, UnprotectedAsset } from '../../../types/reportView'
import { emptyBand, finalizeBand } from '../../aggregation/coverage'
import { avamarProvenance } from '../../aggregation/provenance'
import { cellNum, cellStr } from '../../aggregation/rows'

/** Sum the `Total` column over rows whose `Has Backups` equals `flag`. */
function hasBackupsCount(wb: RawWorkbook, sheet: string, flag: 'True' | 'False'): number {
  const rows = wb.sheets[sheet]?.rows ?? []
  return rows
    .filter((r) => cellStr(r, 'Has Backups') === flag)
    .reduce((acc, r) => acc + cellNum(r, 'Total'), 0)
}

/** Sum the `Total` column over every row of a sheet. */
function sumTotal(wb: RawWorkbook, sheet: string): number {
  return (wb.sheets[sheet]?.rows ?? []).reduce((acc, r) => acc + cellNum(r, 'Total'), 0)
}

/** Latest-date Max Utilization (%) per node → storage targets. */
function nodeTargets(wb: RawWorkbook): StorageTarget[] {
  const rows = wb.sheets['Node Utilization']?.rows ?? []
  const latest = new Map<string, { date: number; util: number }>()
  for (const r of rows) {
    const node = cellStr(r, 'Node')
    const date = cellNum(r, 'Date')
    const util = cellNum(r, 'Max Utilization (%)')
    const prev = latest.get(node)
    if (!prev || date >= prev.date) latest.set(node, { date, util })
  }
  return [...latest.entries()].map(([node, { util }]) => ({
    name: `Avamar node ${node}`,
    type: 'Avamar grid node',
    utilizationPct: util,
    flagged: util >= FLAG_THRESHOLD_PCT,
  }))
}

/** Disabled-group names, disambiguated by domain when the domain is not the root '/'. */
function disabledGroups(wb: RawWorkbook): string[] {
  const rows = wb.sheets['Disabled Groups']?.rows ?? []
  return rows.map((r) => {
    const name = cellStr(r, 'Name')
    const domain = cellStr(r, 'Domain')
    return domain && domain !== '/' ? `${name} (${domain})` : name
  })
}

/** Avamar composition root: RawWorkbook → ReportView. Pure. MVP fidelity (see plan). */
export function buildAvamarView(wb: RawWorkbook): ReportView {
  // coverage — count-based; retired clients → excluded band; no per-type breakdown.
  const protectedN = hasBackupsCount(wb, 'NonRetired Clients With Backups', 'True')
  const unprotectedN = hasBackupsCount(wb, 'NonRetired Clients With Backups', 'False')
  const excluded = sumTotal(wb, 'Retired Clients With Backups')
  const overall = finalizeBand({ ...emptyBand(), protected: protectedN, unprotected: unprotectedN, excluded })

  // jobs — Avamar-native buckets; success excludes Exception + Failed.
  const bcs = wb.sheets['Backup Completion Summary']?.rows[0]
  const success = cellNum(bcs ?? {}, 'Successful')
  const exception = cellNum(bcs ?? {}, 'Exception')
  const failed = cellNum(bcs ?? {}, 'Failed')
  const jobsTotal = cellNum(bcs ?? {}, 'Total')
  const counts: Record<string, number> = { SUCCESS: success, EXCEPTION: exception, FAILED: failed }

  // gaps — unprotected-client list, no per-asset size.
  const noBackupRows = wb.sheets['Clients No Backups']?.rows ?? []
  const gapItems: UnprotectedAsset[] = noBackupRows.map((r) => ({
    name: cellStr(r, 'Full Domain'),
    type: cellStr(r, 'Client Type'),
    sizeGb: undefined,
  }))
  const gapTop = gapItems.slice(0, TOP_N_DEFAULT)

  // workload types in use — plugins with a positive count.
  const inUse = (wb.sheets['Backup Plugins']?.rows ?? [])
    .filter((r) => cellNum(r, 'Count') > 0)
    .map((r) => cellStr(r, 'Plugin Name'))

  // policies — distinct protection-group count only.
  const groupNames = new Set(
    (wb.sheets['Group Summary']?.rows ?? []).map((r) => cellStr(r, 'Group Name')).filter(Boolean),
  )

  return {
    meta: wb.meta,
    inUse,
    idleAgents: disabledGroups(wb),
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
      successPct: jobsTotal > 0 ? success / jobsTotal : 0,
      capped: false,
      windowSize: jobsTotal,
    },
    compliance: {
      appConsistentPct: 0,
      immutablePct: 0,
      replicatedPct: 0,
      appConsistentCount: 0,
      immutableCount: 0,
      replicatedCount: 0,
      backupLevelMix: {},
      windowSize: 0,
      capped: false,
    },
    capacity: { targets: nodeTargets(wb), flagged: nodeTargets(wb).filter((t) => t.flagged), mtreeCount: 0 },
    policies: { count: groupNames.size, byPurpose: {}, perPolicy: [] },
    provenance: avamarProvenance(),
  }
}
```

Note: `cellStr`/`cellNum` accept a `Record<string, Cell>` row; passing `bcs ?? {}` keeps types happy when the sheet is absent. Compute `nodeTargets(wb)` once into a local if you prefer to avoid the double call — either is correct; if you extract a local, keep it before the return.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/engines/products/avamar/buildAvamarView.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Typecheck, suite, lint**

Run: `npm run typecheck` → exit 0. `npx vitest run` → all green (additive; nothing else imports `buildAvamarView` yet). `./node_modules/.bin/biome check .` → clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(avamar): buildAvamarView adapter + synthetic fixture (not yet registered)"
```

---

## Task 3: Register Avamar + generalize provenance wording + integration

Flip the switch: register the builder so upload admits Avamar and the document/UI/export light up. Fix the phase-1 skip-guard test (its unbuilt-product example was `'avamar'`, now built). Generalize the `provenance.unavailable` copy (it currently says "summary-format reports", wrong for Avamar).

**Files:**
- Modify: `src/engines/products/index.ts`, `src/engines/products/estateDocument.test.ts`, `src/i18n/locales/{en,fr,de,it}/dashboard.json`
- Test: `src/engines/products/estateDocument.test.ts` (add an Avamar-builds case), `src/hooks/useReportUpload.test.ts` (Avamar admitted)

**Interfaces:**
- Consumes: `buildAvamarView` (Task 2), `getViewBuilder`/`isSupportedProduct` (`src/engines/products/index.ts`), `avamarWorkbookBuffer` (Task 2), `normalizeWorkbook`.

- [ ] **Step 1: Register the Avamar builder**

In `src/engines/products/index.ts`, import and register:

```ts
import { buildAvamarView } from './avamar/buildAvamarView'
// …
const BUILDERS: Partial<Record<ProductId, ViewBuilder>> = {
  ppdm: buildPpdmView,
  avamar: buildAvamarView,
}
```

- [ ] **Step 2: Run the suite to see the phase-1 skip-guard test break**

Run: `npx vitest run src/engines/products/estateDocument.test.ts`
Expected: the "skips a recognized-but-unbuilt product without crashing the document" test now FAILS — it tagged a PPDM-shaped workbook as `'avamar'` and expected it to be skipped, but `'avamar'` now has a builder. This confirms the registration took effect.

- [ ] **Step 3: Fix the skip-guard test to use a still-unbuilt product, and add an Avamar-builds case**

In `src/engines/products/estateDocument.test.ts`, change the skip-guard test's tag from `'avamar'` to `'networker'` (still unregistered) so it remains a genuine skip-guard:

```ts
it('skips a recognized-but-unbuilt product without crashing the document', () => {
  const doc = buildEstateDocument([
    ppdmServer('a'),
    { label: 'x', product: 'networker', workbook: normalizeWorkbook(detailWorkbookBuffer()) },
  ])
  expect(doc.products.map((p) => p.product)).toEqual(['ppdm'])
})
```

Add a new case proving Avamar now builds (import `avamarWorkbookBuffer` from `../../test-helpers/workbooks`):

```ts
it('builds an Avamar server into its own product section', () => {
  const doc = buildEstateDocument([
    { label: 'ava', product: 'avamar', workbook: normalizeWorkbook(avamarWorkbookBuffer()) },
  ])
  expect(doc.products.map((p) => p.product)).toEqual(['avamar'])
  expect(doc.products[0]?.estate.combined.coverage.overall.protected).toBe(6)
})
```

- [ ] **Step 4: Add an upload-admits-Avamar test**

In `src/hooks/useReportUpload.test.ts`, add a test that mocks `parseInWorker` to resolve the Avamar workbook (parsed) and asserts it is stored (not rejected). Match the file's existing `parseInWorker` mock style; resolve `normalizeWorkbook(avamarWorkbookBuffer())` for the avamar file and assert the store length increases and no error mentions that file:

```ts
it('admits an Avamar workbook (now a supported product)', async () => {
  const ava = normalizeWorkbook(avamarWorkbookBuffer())
  mockedParseInWorker.mockResolvedValueOnce(ava) // adapt to this file's mock variable
  const { result } = renderHook(() => useReportUpload())
  await act(async () => {
    await result.current.upload([new File(['x'], 'ava.xlsx')])
  })
  expect(useReportStore.getState().servers).toHaveLength(1)
  expect(useReportStore.getState().servers[0]?.product).toBe('avamar')
  expect(result.current.error).toBeNull()
})
```

Adapt the mock mechanism and imports (`normalizeWorkbook`, `avamarWorkbookBuffer`, `act`, `renderHook`, `useReportStore`) to match the existing test file. If the file mocks the worker differently, follow that pattern — the assertion (stored, product `'avamar'`, no error) is the point.

- [ ] **Step 5: Generalize the `provenance.unavailable` copy in all four locales**

In `src/i18n/locales/<locale>/dashboard.json`, change the `provenance.unavailable` value (currently "Not available for summary-format reports" in en):
- en: `"unavailable": "Not available for this report type"`
- fr: `"unavailable": "Non disponible pour ce type de rapport"`
- de: `"unavailable": "Für diesen Berichtstyp nicht verfügbar"`
- it: `"unavailable": "Non disponibile per questo tipo di report"`

(Same key path `provenance.unavailable`; only the value changes — parity unaffected. This is more accurate for both Avamar and summary-PPDM.)

- [ ] **Step 6: Typecheck, full suite, parity, build**

Run: `npm run typecheck` → exit 0.
Run: `npx vitest run` → all green (skip-guard fixed; new Avamar cases pass).
Run: `npx vitest run src/i18n/keyParity.test.ts` → PASS.
Run: `./node_modules/.bin/biome check .` → clean.
Run: `npm run build` → success, `check-supply-chain: OK`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(avamar): register adapter; generalize provenance copy; integration tests"
```

---

## Task 4: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/ARCHITECTURE.md`

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, update the product-adapter-registry bullet: the registry now has **PPDM and Avamar** (`buildPpdmView`, `buildAvamarView`); NetWorker is detected but not yet built (phase 3). Note Avamar's MVP shape: count-based coverage, Avamar-native job buckets, size-less gaps, node-utilization capacity, plugin workload types, group-count policies, compliance N/A. Note `gaps` sizes are now optional (`UnprotectedAsset.sizeGb?`, `Gaps.totalCapacityGb?`) rendering "size unknown".

- [ ] **Step 2: Update docs/ARCHITECTURE.md**

Run: `/usr/bin/grep -n 'product-adapter\|buildPpdmView\|registry' docs/ARCHITECTURE.md`
Add Avamar alongside PPDM in the registry description and a short Avamar mapping note (mirroring the spec's Avamar table). Note the size-optional gaps contract. Do not overstate NetWorker (still phase 3).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md
git commit -m "docs: Avamar adapter + size-optional gaps in CLAUDE.md and ARCHITECTURE"
```

---

## Self-Review

**1. Spec coverage** (against the Avamar section of `docs/superpowers/specs/2026-06-19-multi-product-support-design.md`, refined by real CRAMIF data):
- meta (base-2) → Task 2 (`wb.meta`, baseTen false asserted). ✅
- count-based coverage + retired→excluded, no by-type → Task 2. ✅
- jobs native buckets, success excludes exception/failed → Task 2. ✅
- size-less gaps (contract change) → Task 1 + Task 2. ✅
- node-utilization capacity → Task 2. ✅
- plugin workload types (inUse) → Task 2. ✅
- idle = disabled groups (locked decision) → Task 2. ✅
- policies = group count (locked decision) → Task 2. ✅
- compliance N/A + provenance flags → Task 2 (`avamarProvenance`). ✅
- register → upload admits → document/UI/export light up → Task 3. ✅
- i18n parity (sizeUnknown, generalized unavailable copy) → Tasks 1, 3. ✅
- NetWorker → out of scope (phase 3), not overstated. ✅

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code; the one adaptation note (useReportUpload mock variable) names exactly what to match and the invariant assertion.

**3. Type consistency:** `buildAvamarView(wb: RawWorkbook): ReportView`, `avamarProvenance(): Record<MetricKey, MetricProvenance>`, `formatGbOrUnknown(gb: number | undefined, locale, unknown): string`, `UnprotectedAsset.sizeGb?: number`, `Gaps.totalCapacityGb?: number`, `StorageTarget`/`UnprotectedAsset` shapes match `src/types/reportView.ts`. Helper names (`cellStr`/`cellNum` from `rows.ts`, `emptyBand`/`finalizeBand` from `coverage.ts`, `TOP_N_DEFAULT`/`FLAG_THRESHOLD_PCT` from `ppdm.ts`) match their modules. No drift.

## Known follow-ups (out of scope, noted for a later polish)

- The compliance bars (dashboard `JobsComplianceSection` + export `complianceSection`) still render 0% with a "not available" caveat when compliance is unavailable — pre-existing behavior shared with summary-PPDM (the dashboard *exec* Immutable KPI is already gated to "—"). A future polish could gate the bars too; deferred because it changes summary-PPDM rendering.
- `capacity.mtrees` note shows "0 mtrees" for Avamar (a Data Domain term). Harmless; could be relabeled per-product later.
