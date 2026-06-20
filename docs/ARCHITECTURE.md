# ARCHITECTURE — ppdm-report

**Status:** Current (2026-06-19)
**Design spec:** [`docs/superpowers/specs/2026-06-18-ppdm-report-design.md`](superpowers/specs/2026-06-18-ppdm-report-design.md)
**README:** [`README.md`](../README.md)

---

## 1. Three-tier spine

```
pure engines/  →  inputs-only Zustand store  →  one bridge hook  →  lean UI + exports
```

The entire system is organised around a single, enforced constraint: **no derived metric may be
stored, computed more than once, or touched by anything other than `useReportView`**. This creates
three tiers with hard dependency boundaries:

| Tier | Modules | Allowed to import |
|---|---|---|
| **Engines** | `src/engines/**` | Each other (aggregation → rows helpers), `src/types/`, `src/theme/palette.ts`, `src/utils/` |
| **Store** | `src/store/reportStore.ts` | `src/types/ppdm.ts` only |
| **UI + hooks** | `src/hooks/`, `src/components/`, `src/App.tsx` | Everything above |

`src/engines/` contain no React imports, no DOM references, no Zustand calls, and no side effects.
Violated once and the tier boundary collapses.

### Data-flow diagram

```
File drop (browser File API)
  │
  ▼
src/hooks/useReportUpload.ts  ← calls parseInWorker(file)
  │  reads File → ArrayBuffer on main thread; transfers buffer to worker
  │  rejects unsupported products per-file (isSupportedProduct check)
  │
  ▼  [Web Worker boundary — ArrayBuffer transferred, not copied]
src/engines/parser/parser.worker.ts
  │  only file that imports SheetJS (xlsx 0.20.3 CDN pin)
  │  fetchGuard installed as FIRST import (same-origin invariant in worker too)
  ├─ readWorkbook(buf)        → XLSX.WorkBook
  ├─ toSheetData(wb)          → SheetData[]  (headers + keyed rows + capped flag)
  ├─ captureMeta(wb)          → CaptureMeta  (Zod-validated at this boundary)
  └─ normalizeWorkbook(buf)   → RawWorkbook  (product-neutral: { meta, sheets, warnings })
  │
  │  posts RawWorkbook back to main thread; detectProduct tags it with ProductId
  ▼
src/engines/parser/detectProduct.ts  (classifies by sheet-name signature)
  │  'ppdm'      → has 'System Configuration' | 'Data Domain Mtrees' | 'Storage Targets'
  │  'avamar'    → has 'Avamar DPN Summary', or 'Backup Completion Summary'+'Backup Plugins'
  │  'networker' → has 'Storage Nodes' + 'Dedup Jobs'
  │  'unknown'   → none of the above; rejected by useReportUpload
  │
  ▼
src/store/reportStore.ts  (Zustand)
  │  stores: servers: ServerWorkbook[]  (each tagged { label, product, workbook: RawWorkbook })
  │          flavor: 'assessment' | 'ops'
  │  ONLY inputs — no derived metrics ever enter the store
  │
  ▼
src/hooks/useReportView.ts
  │  THE single useMemo: buildEstateDocument(servers) keyed on servers array
  │
  ▼
src/engines/products/estateDocument.ts  (buildEstateDocument — document root)
  │  groups servers by product; for each product group:
  │    getViewBuilder(product)         → ViewBuilder from the product-adapter registry
  │    build(wb: RawWorkbook)          → ReportView   (one per server)
  │    mergeViews(perServer views)     → combined EstateView
  │  returns EstateDocument { products: ProductEstate[], multiProduct }
  │  No cross-product totals; phase 2 supports PPDM and Avamar.
  │
  │  Per-product adapters (phase 2: PPDM + Avamar — see §3 for details):
  ├─ src/engines/products/ppdm/buildPpdmView.ts    (PPDM: branches on format, classifyAgents, full pipeline)
  └─ src/engines/products/avamar/buildAvamarView.ts (Avamar: count-based coverage, node utilization, no compliance)
  │  returns EstateDocument  (pure value, no store write)
  │
  ├──▶ src/App.tsx  → one <ProductSection> per product (no cross-product totals)
  │     └─ <Dashboard view={estate.combined}> per product
  │         └─ ordered sections per flavor (assessment or ops)
  │
  └──▶ src/hooks/useExport.ts
        │  MAIN THREAD — pptxgenjs is not Web-Worker-safe
        ├─ buildExportModel(view, flavor, theme, t, locale)  → ExportModel  (pure)
        ├─ buildPptx(model, theme)    → ArrayBuffer  (dynamic import — stays out of main bundle)
        └─ assembleHtml(model, theme) → string       (static import)
```

Key invariant: **`RawWorkbook` (tagged as `ServerWorkbook`) enters the store; `EstateDocument` never does.**
`useReportView` is the only bridge; rebuilds from scratch on every server list change (it memos on `[servers]` only — `flavor` flows separately to `Dashboard` and `useExport` via the store).

### Product-adapter registry (`src/engines/products/index.ts`)

`getViewBuilder(product)` returns the registered `ViewBuilder` for a `ProductId`, or `undefined`
when unsupported. `isSupportedProduct(product)` is the boolean shorthand. Phase 2 registers two
adapters: `ppdm → buildPpdmView` and `avamar → buildAvamarView`. NetWorker detection
(`detectProduct`) is implemented but its view-builder is not yet registered — that is phase 3.

---

## 2. Parser layer

All parser modules live under `src/engines/parser/`. SheetJS is imported in exactly one place: the
worker entry point.

### Module responsibilities

| File | Role |
|---|---|
| `parser.worker.ts` | Web Worker entry; installs `fetchGuard` first; delegates to `normalizeWorkbook`; posts `ParseResponse` |
| `parseInWorker.ts` | Main-thread glue; lazily constructs the worker; multiplexes requests by ID via `ParseRequest` / `ParseResponse` message pairs; transfers `ArrayBuffer` (zero-copy) |
| `readWorkbook.ts` | `readWorkbook(buf)` — `XLSX.read`; `toSheetData(wb)` — all sheets to `SheetData[]`; `parseXlsx(buf)` — convenience combinator; sets `capped: true` when `dataRows.length >= LIVE_OPTICS_ROW_CAP` (10,000) |
| `normalizeWorkbook.ts` | Composition root: calls `readWorkbook`, `toSheetData`, `captureMeta`; emits capped-sheet warnings into `RawWorkbook.warnings` (never silent) |
| `detectProduct.ts` | `detectProduct(wb)` — classifies a `RawWorkbook` by sheet-name signature → `ProductId`; called by `useReportUpload` immediately after `normalizeWorkbook` |
| `detectInUse.ts` | `sheetIsInUse(sheet)` — a row is real when at least one cell is non-null and not `"N/A"`; `classifyAgents(sheets)` — partitions the 18 known `AGENT_SHEETS` into `inUse` / `idleAgents`; called inside `buildPpdmView`, not at parse time |
| `captureMeta.ts` | Reads the `Details` sheet as a key/value map; applies `CaptureMetaSchema` (Zod); converts serial dates via `serialToIso` |
| `serialToIso.ts` | Excel serial date → ISO-8601 UTC: offset `25569` days from 1899-12-30 to Unix epoch |

### Zod boundary

Zod validation occurs exactly once: in `captureMeta.ts` on the `Details` sheet key/value pairs. The
five typed output fields are `projectId`, `customer`, `collectorBuild`, `capturedAt`, `baseTen`. Row
data from all other sheets is typed as `Record<string, Cell>` (where `Cell = string | number |
boolean | null`) and coerced by the aggregation helpers (`cellStr`, `cellNum`) rather than validated
upfront — this avoids Zod schema drift as PPDM sheet layouts vary between collector versions.

### Capped-sheet handling

`LIVE_OPTICS_ROW_CAP = 10_000` is declared in `src/types/ppdm.ts`. `readWorkbook.ts` sets
`SheetData.capped = dataRows.length >= LIVE_OPTICS_ROW_CAP`. `normalizeWorkbook.ts` collects one
warning per capped sheet into `RawWorkbook.warnings`. The two sheets that routinely hit the cap
are `Copies` and `Protection Job Activities`; metrics derived from them (`computeCompliance`,
`computeJobs`) return `capped: boolean` and `windowSize: number` so the UI and exports can print the
caveat in-place.

### In-use detection

`AGENT_SHEETS` (18 asset-type sheet names, declared in `src/types/ppdm.ts`) is the canonical list.
A sheet is **in use** when `sheetIsInUse` returns `true`: at least one row has a cell that is not
`null`, `undefined`, `""`, or `"N/A"` (case-insensitive). Idle sheets go to `idleAgents`; they
receive no coverage computation and no per-type export section (requirements #6 and #7 of the
design spec share a single mechanism).

`classifyAgents` is PPDM-specific and is called inside `buildPpdmView` (not at parse time). The
parse layer (`normalizeWorkbook`) emits a product-neutral `RawWorkbook`; agent classification is a
product concern that belongs to the PPDM adapter.

---

## 3. Metric engines

All aggregation modules live under `src/engines/aggregation/`. Every export is a pure function; none
imports React, Zustand, or DOM APIs.

### PPDM composition root

`src/engines/products/ppdm/buildPpdmView.ts` exports the PPDM adapter:

```ts
function buildPpdmView(wb: RawWorkbook): ReportView
```

It branches on `detectFormat(wb)`: summary workbooks are handled by `summaryView`; detail workbooks
go through the full aggregation pipeline. `classifyAgents` is called here (PPDM-specific concern).
This function is registered in the product-adapter registry as the `ViewBuilder` for `'ppdm'`.
`buildEstateDocument` calls it once per server; `mergeViews` combines the per-server results.

### Avamar composition root

`src/engines/products/avamar/buildAvamarView.ts` exports the Avamar MVP adapter:

```ts
function buildAvamarView(wb: RawWorkbook): ReportView
```

Avamar-specific mapping (all pure, no format branching needed for MVP):

| Metric | Source | Notes |
|---|---|---|
| **meta** | `Details` sheet (generic) | `baseTen: false` — Avamar reports base-2 byte values |
| **coverage** | `NonRetired Clients With Backups` + `Retired Clients With Backups` | Count-based only; retired clients → excluded band; no per-type breakdown (`byType: {}`) |
| **jobs** | `Backup Completion Summary` (single summary row) | Avamar-native buckets: SUCCESS / EXCEPTION / FAILED; `successPct` excludes exception + failed |
| **gaps** | `Clients No Backups` | Client list only — **no per-asset size** (`sizeGb: undefined`, `totalCapacityGb: undefined`); renders as "size unknown" |
| **capacity** | `Node Utilization` | Per-node max utilisation (latest date reading); no Data Domain mtrees (`mtreeCount: 0`) |
| **workload types** (inUse) | `Backup Plugins` | Plugins with a positive count |
| **idle list** (idleAgents) | `Disabled Groups` | Group names, disambiguated by domain when not root `/` |
| **policies** | `Group Summary` | Distinct protection-group count; no `byPurpose` or `perPolicy` rows |
| **compliance** | — | N/A (not in Avamar exports); fields zeroed; provenance marks it unavailable |

Provenance (`avamarProvenance()`): `coverageByType` and `compliance` → `unavailable`; `gapsList`
and `storageTargets` → `available`.

#### Gaps size-optional contract

`UnprotectedAsset.sizeGb?: number` and `Gaps.totalCapacityGb?: number` are optional across all
products. When absent (as in Avamar), the UI and exports call `formatGbOrUnknown` and render "size
unknown" rather than a misleading zero. PPDM gaps carry sizes and are unaffected.

### Domain engines

| Module | Input | Output type | Notes |
|---|---|---|---|
| `coverage.ts` | `inUse` sheet names (from `classifyAgents`) + `RawWorkbook.sheets` | `Coverage` | Iterates `Protection Status` ∈ `PROTECTED/UNPROTECTED/EXCLUDED`; `pct = PROTECTED/(PROTECTED+UNPROTECTED)` (headline); `pctInclExcluded = PROTECTED/(P+U+EXCLUDED)` (secondary); per-type `byType` + `overall` |
| `gaps.ts` | `wb.sheets['Unprotected Assets']` | `Gaps` | `count`, `totalCapacityGb`, `top` (top-N ranked by `sizeGb` via `topN` helper) |
| `jobs.ts` | `wb.sheets['Protection Job Activities']` | `Jobs` | `countBy(rows, 'Result')`, `successPct`, `capped`, `windowSize` |
| `compliance.ts` | `wb.sheets.Copies` | `Compliance` | `appConsistentPct` (`APPLICATION_CONSISTENT`); `immutablePct` (any non-`ALL_COPIES_UNLOCKED` Lock Status); `replicatedPct` (`Replica === 'TRUE'`); `backupLevelMix`; `capped`, `windowSize` |
| `capacity.ts` | `wb.sheets['Storage Targets']` + `wb.sheets['Data Domain Mtrees']` | `Capacity` | `StorageTarget[]` with `flagged: utilizationPct >= 80`; `flagged` (subset); `mtreeCount` |
| `policies.ts` | `wb.sheets.Policies` | `Policies` | `count`, `byPurpose` (countBy `Purpose`), `perPolicy` (`PolicyRow[]`) |
| `rows.ts` | any `Row` | helpers | `cellStr` (trims, maps `N/A` → `""`), `cellNum` (comma-stripping, finite check), `countBy` (non-blank tally) |

### `topN` helper (`src/engines/aggregation/topN.ts`)

```ts
function topN<T>(items: T[], n: number, score: (t: T) => number): TopList<T>
```

Sorts descending by `score`, slices to `n`, returns `{ items, total, shown }`. Used by `gaps.ts`
(top-25 unprotected assets by `sizeGb`) and by `buildExportModel` for any list that needs a
"top 25 of N" caption. The default `n` is 25 in all call sites.

---

## 4. State and hooks

### Store (`src/store/reportStore.ts`)

Zustand store with two pieces of input state and their setters:

| Field | Type | Purpose |
|---|---|---|
| `servers` | `ServerWorkbook[]` | Tagged array: each entry is `{ label, product: ProductId, workbook: RawWorkbook }` |
| `flavor` | `'assessment' \| 'ops'` | Active report flavor (default: `'assessment'`) |

No derived metrics are stored. The store exposes `addServers`, `removeServer`, `setFlavor`, and `clear`.

Language preference and theme preference are **not** in the Zustand store; they live in
`localStorage` (`ppdm-report-lang`, `ppdm-report-theme`) and are read on mount by `useTheme` and
the i18next `LanguageDetector`.

### Hooks

| Hook | What it does |
|---|---|
| `useReportUpload` | Calls `parseInWorker(file)`, runs `detectProduct`, rejects unsupported products, writes `ServerWorkbook` to store via `addServers`; exposes `{ upload, busy, error }` |
| `useReportView` | **The single `useMemo`**: `buildEstateDocument(servers)` keyed on `servers`; returns `EstateDocument \| null` |
| `useTheme` | Three-state preference (`auto/light/dark`) backed by `localStorage['ppdm-report-theme']`; toggles `.dark` on `<html>`; returns `{ theme, resolved, setTheme }` |
| `useExport` | Takes the `EstateDocument`; resolves the (phase-1 single) product's `ReportView` via `products[0].estate.combined`, plus `flavor`, `resolved` theme, and active locale; calls `buildExportModel` then either `buildPptx` (dynamic import) or `assembleHtml`; triggers browser download |

**`useReportView` is the only place `buildEstateDocument` is called from the UI side.** `App.tsx`
receives `EstateDocument` and renders one `<ProductSection>` per product; no cross-product totals.

---

## 5. UI layer

### App shell (`src/App.tsx`)

Sticky header with title and five controls (`FlavorToggle`, `LanguageToggle`, `ThemeToggle`,
`ExportButtons`, `UploadZone`). Below the header: `<UploadZone />` then one `<ProductSection>` per
product in the `EstateDocument`. No routing; single-page.

### Dashboard (`src/components/dashboard/Dashboard.tsx`)

One scrollable `<div>` receiving `view: ReportView`. Section order is flavor-driven:

- **Assessment**: `ExecutiveKpis` → `CoverageSection` → `GapsSection` → `IdleAgentsSection` →
  `JobsComplianceSection` → `CapacitySection` → `PoliciesSection`
- **Ops**: `ExecutiveKpis` → `JobsComplianceSection` → `CapacitySection` → `CoverageSection` →
  `GapsSection` → `IdleAgentsSection` → `PoliciesSection`

Font: `Arial, Helvetica, sans-serif` applied inline on the container. Tailwind `dark:` variants
handle colour for the non-chart elements.

### Chart component (`src/components/Chart.tsx`)

**The only ECharts import site.** Uses the tree-shaken core API:

```ts
echarts.use([BarChart, PieChart, DatasetComponent, GridComponent,
             LegendComponent, TooltipComponent, SVGRenderer])
```

Registers both named themes on module load:
```ts
echarts.registerTheme('midnight-light', MIDNIGHT_EXECUTIVE_LIGHT)
echarts.registerTheme('midnight-dark',  MIDNIGHT_EXECUTIVE_DARK)
```

On the `dark` prop changing the instance is disposed and re-initialised with the opposite theme
name; `option` changes are applied via `setOption` without re-initialising. The renderer is always
`'svg'` (no canvas fallback). The component is `memo`-wrapped.

### KPI cards and toggles

`KpiCard.tsx` — accent-coloured left-border card; tone variants `ok/warn/bad/accent/muted`.
`FlavorToggle.tsx`, `LanguageToggle.tsx`, `ThemeToggle.tsx` — each writes to the store or calls the
appropriate setter; stateless beyond that.

---

## 6. Export layer

### `buildExportModel` (`src/engines/export/buildExportModel.ts`)

Pure function:

```ts
function buildExportModel(
  view: ReportView,
  flavor: ExportFlavor,    // 'assessment' | 'ops'
  theme: ExportTheme,      // 'light' | 'dark'
  t: TFn,                  // i18next TFunction
  locale: string,
): ExportModel
```

Reads `ReportView` fields only — does not recompute any metric. Applies flavour ordering (same logic
as Dashboard), filters the idle-agents section to `null` when `idleAgents.length === 0`, resolves
the `Palette` (`LIGHT` or `DARK` from `src/theme/palette.ts`), formats all values with
`src/utils/format.ts` helpers, and returns a fully localised, serialisable `ExportModel`. All string
values are already translated; the export renderers receive no `TFn`.

### PPTX (`src/engines/export/pptx/builder.ts`)

`buildPptx(model, theme): Promise<ArrayBuffer>` — builds a pptxgenjs presentation:

- Title slide: customer, subtitle, footer note.
- Executive summary slide: four hero KPIs in a 2×2 band.
- One content slide per `ExportSection` via `addSection()` (KPI band → chart → table → notes).
  - Charts are native pptxgenjs `addChart` calls (`doughnut` for pie, `bar`); colours from the
    active palette.
  - Tables use `addTable` with `autoPage: true`; caption rendered below the table.
  - All text uses `fontFace: 'Arial'`.
- Returns `await pptx.write({ outputType: 'arraybuffer' })`.

**Deliberate main-thread execution:** `pptxgenjs` is not Web-Worker-safe (it references `document`
internally). A ~15-slide deck generates in well under a second. `useExport` dynamically imports
`builder.ts` (`await import('../engines/export/pptx/builder')`) so pptxgenjs + jszip are excluded
from the initial bundle and only loaded when the user requests a PPTX export.

### HTML (`src/engines/export/html/assembleHtml.ts`)

`assembleHtml(model, theme): string` — synchronous; produces a self-contained HTML document:

- All CSS inlined in a `<style>` block; sRGB hex palette tokens from `LIGHT` / `DARK`.
- `Content-Security-Policy` meta: `default-src 'none'; style-src 'unsafe-inline'; img-src data:`.
  No JavaScript, no external resources.
- `lang` attribute set from `model.locale`.
- Charts rendered as proportional stacked `<div>` bars with a legend (no JS required).
- Tables rendered with `<table>` / `<thead>` / `<tbody>`; caption as `<p class="cap">`.
- `<footer>` carries the base-10 unit note, collector build, and capture date.

### Export type contracts (`src/engines/export/types.ts`)

Key interfaces: `ExportModel`, `ExportSection`, `ExportKpi`, `ExportTable`, `ExportChart`,
`ExportChartSlice`, `ExportRequest`, `ExportResponse`. `ExportTone = 'accent' | 'ok' | 'warn' |
'bad' | 'muted'`. Both renderers consume `ExportModel` and nothing else from the application.

---

## 7. i18n, theme, and privacy

### i18n (`src/i18n/`)

react-i18next with four locales (`en`, `fr`, `de`, `it`) and two namespaces (`common`,
`dashboard`). Locale detection order: querystring (`?lang=`), `localStorage['ppdm-report-lang']`,
browser `navigator`. Fallback: `en`.

**Key-parity test** (`src/i18n/keyParity.test.ts`): recursively flattens the `en/` JSON trees and
asserts that every locale has exactly the same leaf keys — no extras, no missing. Derives the
namespace list from the `en/` directory at test time, so new namespaces are automatically covered.
This test runs as part of `npm run test:run` and blocks CI on failure.

Numbers, percentages, bytes, and dates are never pre-formatted in translation strings. All
formatting is delegated to `src/utils/format.ts` helpers which apply the active locale:

```ts
fmtInt(n, locale)           // locale-aware integer
fmtPercent(pct, locale)     // 0–1 → "71.4 %"
fmtPercentValue(n, locale)  // already-percent value
formatBytes(bytes, locale)  // base-10 (GB/TB)
```

### Theme (`src/theme/`)

`src/theme/palette.ts` exports two named palette objects, `LIGHT` and `DARK`, each typed as
`Palette`. All colour values are sRGB hex (zrender and pptxgenjs cannot parse `oklch()`). The
"Midnight Executive" palette includes `bg`, `surface`, `ink`, `muted`, `line`, `accent`, `ok`,
`warn`, `bad`, `excluded`, and a `series` array of six chart colours.

`src/theme/echartsTheme.ts` maps palette tokens to ECharts theme objects (`MidnightExecutiveTheme`)
for `midnight-light` and `midnight-dark`. Registered once in `Chart.tsx`.

`useTheme` persists the three-state preference (`auto/light/dark`) in `localStorage['ppdm-report-theme']`
and toggles `.dark` on `document.documentElement`. Tailwind CSS v4 reads the `.dark` class via
`@custom-variant dark (&:where(.dark, .dark *))`. ECharts, PPTX, and HTML exports all consume the
resolved `'light' | 'dark'` value — no component reads `prefers-color-scheme` directly.

### Privacy (`src/privacy/fetchGuard.ts`)

Side-effect module installed as the **first import** in both `src/main.tsx` and
`src/engines/parser/parser.worker.ts`. On load it wraps:

- `globalThis.fetch` — throws `PrivacyViolation` on non-same-origin URLs
- `XMLHttpRequest.prototype.open` — same check
- `navigator.sendBeacon` — same check
- `globalThis.WebSocket` — throws `InsecureTransportViolation` on non-`wss:` schemes, then
  `PrivacyViolation` on non-same-origin

Throws are synchronous and named so they appear unambiguously in error logs. The module is
idempotent (a module-scoped `installed` flag prevents double-patching). The only `localStorage`
keys the application ever writes are `ppdm-report-theme` and `ppdm-report-lang`; no dataset rows
are persisted across sessions.

---

## 8. Build and quality gates

### Vite (`vite.config.ts`)

```ts
worker: { format: 'es' }   // parser.worker compiled as ES module
```

`manualChunks`: any module path containing `echarts` or `zrender` goes into an `'echarts'` chunk,
keeping ECharts out of the main application bundle. pptxgenjs is excluded from the initial load by
the dynamic `import()` in `useExport`.

### Vitest (`vitest.config.ts`)

Environment: `jsdom` with `url: 'http://localhost/'` (required for `localStorage` and same-origin
checks). Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom` matchers).

Coverage settings:
- Provider: `v8`
- **Included**: `src/engines/**`, `src/utils/**`, `src/privacy/**`
- **Excluded**: `src/engines/parser/parser.worker.ts`, `src/engines/parser/parseInWorker.ts`
  (browser/worker glue verified end-to-end)
- **Thresholds**: lines / functions / branches / statements all ≥ **75%**

Current test count: **253 tests, 0 failures, 0 skipped**.

### Biome

Formatter + linter. Configuration mirrors the sibling vatlas project. CI gate: `biome check .` must
exit 0 (0 errors, 0 warnings). `lint:fix` is `biome check --write .`.

### CI gate sequence

```
typecheck  →  lint  →  test  →  build  →  check:supply-chain  →  bundle-size
```

`prebuild` runs `scripts/check-supply-chain.mjs` automatically before every `npm run build`. The
supply-chain check verifies the xlsx CDN tarball pin (must reference
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) and a telemetry denylist. Any red step
blocks merge.

---

## 9. Reuse from vatlas

This codebase is a **fresh repo with the same stack** as the sibling project
[vatlas](https://github.com/fjacquet/vatlas). Patterns are copied; no shared git history.

| Reused largely as-is | PPDM-specific (new) |
|---|---|
| `src/privacy/fetchGuard.ts` | `src/engines/parser/` (all modules) |
| `src/hooks/useTheme.ts` | `src/engines/aggregation/` (all modules) |
| `src/theme/echartsTheme.ts` + `palette.ts` | `src/engines/export/pptx/builder.ts` (dual-theme PPTX) |
| `src/components/Chart.tsx` | `src/engines/export/buildExportModel.ts` |
| `src/i18n/` scaffold (structure + key-parity test pattern) | `src/engines/export/html/assembleHtml.ts` |
| `src/utils/format.ts` | `src/store/reportStore.ts` (flavor field; vatlas has no flavor concept) |
| `src/hooks/useExport.ts` (main-thread export pattern) | `src/types/ppdm.ts` + `src/types/reportView.ts` |
| Vite / Biome / Vitest / CI config skeleton | `src/components/dashboard/` (all section components) |
| Supply-chain check script (xlsx CDN pin + telemetry denylist) | Dual-theme PPTX palette (vatlas is light-only) |

Notable deviation from vatlas: **PPTX export runs on the main thread** because pptxgenjs is not
Web-Worker-safe. vatlas used a dedicated export worker; that pattern is preserved for the HTML path
but intentionally dropped for PPTX.
