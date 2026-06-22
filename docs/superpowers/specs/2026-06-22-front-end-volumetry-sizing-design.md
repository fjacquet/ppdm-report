# Front-end volumetry by workload (presales sizing) — design

- **Date:** 2026-06-22
- **Status:** Approved (design); implementation pending
- **Branch:** `feat/front-end-volumetry`

## Problem

Presales needs **front-end volumetry per workload type** to size target infrastructure (Data Domain
capacity, PPDM appliance, licensing). The workbooks already carry per-asset front-end sizes, but the
deck never surfaces them broken down by type — today the closest figures are coverage *counts* by
type and a single estate-wide unprotected-capacity number. A sizer cannot derive per-workload
back-end capacity from those, because change rate, retention, and dedupe assumptions differ per
workload. The raw input a sizer expects — **front-end TB (FETB) per workload type** — is computable
from the export but not exposed.

## Goal

Add one **additive** report section, **"Front-end volumetry by workload"**, that reports, per in-use
workload/agent type, the front-end data volume split by protection status, as a table-first slide
plus the matching HTML block. It is a sizing *input*, not a sizing *calculator*.

### Non-goals

- **No back-end / sized-capacity calculation.** No change-rate, retention, dedupe, or growth
  modelling. We report front-end TB; the sizer applies its own assumptions.
- **No new parse schema or Zod boundary changes.** Read existing sheets only.
- **No new charting primitive.** Reuse `ExportTable` + the existing `drawTableSlide` path.
- **No cross-product totals.** The estate model keeps products separate (unchanged).
- **No "per backup type" breakdown.** Confirmed against the real `ref/PPDM.xlsx`: the `Backup Type`
  column is `N/A` for Virtual Machines and File Systems and a single fixed `"FULL, DIFFERENTIAL,
  LOG"` string for SQL — it cannot drive a meaningful volumetry split. "Agent type / backup type" in
  the request is read as **workload/agent type**.
- No store, React, or privacy/no-network/SheetJS-pin invariant changes.

## Approved decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Metric | **Both** — discovered (raw) **and** FETB (licensed protection size), side by side. |
| D2 | Scope | **Protected vs Unprotected split** per type; EXCLUDED omitted from totals, reported as a footnote. |
| D3 | Layout | **Table-first** — the numeric per-type table is the slide content (not a graphical band + appendix table). |
| D4 | Totals | **True engine sums** of raw per-asset GB (not re-added display cells). A column with any unreported-size type shows **`≥` + footnote** rather than understating. |
| D5 | Flavors | **Both** — early in `assessment`, late in `ops`. One-line change to make it assessment-only (see §6). |

## 1. Data model — one new derived field (`src/types/reportView.ts`)

```ts
/** Front-end volume for one workload type (or the estate total), split by protection status.
 * Size fields are tri-state: a number ≥ 0 = measured; undefined = "no figure" (renders "–"). */
export interface FrontEndTypeRow {
  type: string
  protectedDiscoveredGb?: number
  protectedFetbGb?: number
  unprotectedDiscoveredGb?: number
  unprotectedFetbGb?: number
}

export interface FrontEnd {
  byType: FrontEndTypeRow[]
  /** EXCLUDED assets across in-use types — reported as a footnote, never in totals. */
  excludedCount: number
}
```

Totals are **not stored** — they are derived from `byType` at render (consistent with the repo's
"no derived metric is ever stored" rule). Per total column: sum the defined cells; render `–` if none
are defined, exact sum if all are, and `≥ sum` (a floor) if some are. A single generic caption note
explains `≥` ("some workloads report no figure for that column; the total is a floor") rather than
listing types — the `–` cells already show which.

Added to `ReportView` as `frontEnd: FrontEnd`. Optional size fields reuse the existing
size-optional contract (`UnprotectedAsset.sizeGb?`, `Gaps.totalCapacityGb?`). Per-type asset *counts*
are intentionally not stored — they are not displayed and not needed once the tri-state size encodes
"measured vs no-figure".

### Cell / unknown rule (honest "–", tri-state)

The aggregator resolves each (type, protection state, metric) to one of three states, so the renderer
needs no extra context:

- **A number ≥ 0** — measured. A genuinely empty bucket (no assets of that type/state) is `0` and
  renders as a formatted `"0 B"`. Does **not** trigger `≥` in the total.
- **`undefined`** — "no figure": the bucket has ≥1 asset but the source column is **absent** or
  **sums to 0** (unreported). Renders `"–"` via `formatGbOrUnknown(..., t('common:sizeUnknown'))`.
  **Triggers `≥` + footnote** in that column's total.

This is what makes SQL's discovered size show `–`: in `ref/PPDM.xlsx` the SQL sheet's
`Asset Total Size (GB)` is present but uniformly 0 across its assets, while its FETB
(`Protection Capacity (GB)`) is populated. Distinguishing "no figure" from a real 0 requires knowing
whether the bucket had assets — tracked transiently during the sheet scan, not stored on the row.

> Heuristic to validate against more exports: treating a populated-but-uniformly-zero column as
> "no figure" assumes a real workload with protected assets never legitimately totals 0 front-end GB.
> Holds for the sampled data; noted as a review point during implementation.

## 2. Aggregation engine (`src/engines/aggregation/frontEnd.ts`, new, pure)

`computeFrontEnd(wb: RawWorkbook, inUse: string[]): FrontEnd`

For each in-use agent sheet, resolve the two size columns from a **candidate list** (column names
differ per sheet — all confirmed in `ref/PPDM.xlsx`), then bucket each row by `Protection Status`
(`PROTECTED` / `UNPROTECTED`; `EXCLUDED` only increments `excludedCount`) and sum per type.

- **discovered** candidates: `Asset Total Discovered Size (GB)` · `Asset Total Size (GB)` ·
  `Discovered Size (GB)`
- **FETB (licensed)** candidates: `Asset Licensed Size (GB)` · `Asset Licensed Protection Size (GB)`
  · `Asset Protection Size (Licensed) (GB)` · `Protection Capacity (GB)` · `Asset FETB (GB)`

Resolve each column once per sheet against `SheetData.headers`; first present header wins; reuse
`cellNum` (comma-stripping, finite-checked). `totals` sums the per-type rows; a total column is
`undefined` (→ `≥` + footnote at render) when any contributing type is `undefined` for it.

`buildPpdmView` calls `computeFrontEnd(wb, inUse)` and adds `frontEnd` to the returned view — keeps
the "add new PPDM metrics in the view builder" rule (not in components or the store).

## 3. Cross-product behavior (provenance, not silent omission)

| Product | `frontEnd` source | Fidelity |
|---|---|---|
| **PPDM detail** | per-asset agent sheets (size columns above) | Full — both metrics, both states, EXCLUDED footnote. |
| **PPDM summary** | `… Count And Cap` / `… Assets & Cap` per-type `Capacity Protected/Unprotected Assets (GB)` | These are **provisioned/discovered** capacity (estate-wide FETB lives separately on `Assets Capacity General`), so they fill the **discovered** columns; FETB columns `undefined`; caveat. `frontEnd` provenance set available (overriding the `allUnavailable` default for this one key). |
| **NetWorker** | `Front End Capacity by Workload` (`Front End Capacity (GB)`, today discarded) | Maps to **`protectedFetbGb`** (front-end capacity = the managed/protected front-end); discovered + unprotected columns `undefined` ("–"); caveat notes the no-split limitation. |
| **Avamar** | none | Unavailable → section **auto-suppressed** by the existing `isRenderable` drop; folded into data-caveats. |

A new **`MetricKey 'frontEnd'`** is threaded through `src/engines/aggregation/provenance.ts`, all four
helpers (`allAvailable`, `allUnavailable`, `networkerProvenance`, `avamarProvenance`), and the
`mergeProvenance` key list. The provenance caveat is composed into `table.caption` (see §5), not via
`withCaveat` (whose output the table slide ignores). Avamar's `frontEnd: { available: false }` plus an
empty `byType` means the section emits nothing renderable and is suppressed.

## 4. Merge layer (`src/engines/aggregation/mergeViews.ts`)

Fold `frontEnd` across servers: union of types, per-field summation (treating `undefined` as absent —
a field stays `undefined` only if every server is `undefined` for it; once any server reports a
number, the merged field is the sum of the reporters), `excludedCount` summed. No totals to merge
(derived at render). **Single-server input is an identity** (one server → its `frontEnd` unchanged) —
the standard merge invariant; covered by a test.

## 5. Export model (`src/engines/export/buildExportModel.ts`)

New `volumetrySection: ExportSection` (`id: 'volumetry'`):

- `title`: `t('dashboard:volumetry.title')`.
- `table.columns`: `[type, Prot. discovered, Prot. FETB, Unprot. discovered, Unprot. FETB]` (localized).
  `table.rows`: one per `byType` entry (each size via `formatGbOrUnknown(formatBytes∘gbToBytes)`,
  `undefined → "–"`) + a final **TOTAL** row derived from `byType` per the per-column rule in §3
  (`–` / exact / `≥ sum`).
- **All caveats go in `table.caption`** — the only channel `drawTableSlide` renders besides the table,
  so they appear on the PPTX slide *and* in HTML. Caption = EXCLUDED footnote (`excludedCount`) · the
  `≥` footnote naming no-figure types · the front-end-only sizing note · the provenance caveat
  (composed in-module via the existing `provenanceCaveat(view.provenance.frontEnd, t)`; **not**
  `withCaveat`, whose output only reaches `notes`/`deck.caveat`, which the table slide ignores).
- `deck.subtitle` + `deck.kpiChips` (Total protected FETB, Total unprotected discovered) — rendered by
  **HTML** (`sectionHtml` reads `deck`, not `kpis`); ignored by the PPTX table slide, where the
  **TOTAL row** carries the totals. No `deck.bars` (table-first).
- Numbers use **base-10** byte formatting via `formatBytes(gbToBytes(gb), locale)` (auto GB/TB) —
  honoring the Live-Optics base-10 convention.

Added to the `byId` record and to `SECTION_ORDER` (§6).

**Empty → suppressed.** When `frontEnd.byType` is empty (e.g. Avamar), the section is built with
**no table/kpis/deck**, so the existing `isRenderable` check drops it and folds the unavailability
into the data-caveats note — never an empty slide. The TOTAL row and KPIs are emitted only when
`byType` is non-empty.

## 6. Rendering & placement

- **PPTX** — rendered as a **full-width table slide, in sequence**, mirroring how `idle` is
  special-cased today. In `src/engines/export/pptx/slidePlan.ts`: pull `volumetry` out of
  band-pairing, emit `{ kind: 'table', section }` at its ordered position, and **exclude it from the
  trailing appendix-table dedup** (so it is not duplicated). `buildPptx`'s existing `kind: 'table'`
  branch routes it to `drawTableSlide`, which already does `autoPage` + repeat-header + on-theme
  continuation slides. No new draw function; the only structural change is the `planSlides`
  special-case.
- **HTML** — `assembleHtml` already renders `kpis` + `table` + `notes`; no new HTML code.
- **Placement / flavor** (`src/engines/export/sectionOrder.ts`) — add `'volumetry'` to the
  `SectionId` union; in `assessment` place it **right after `exposure`**; in `ops` place it **before
  `policies`**. Assessment-only would be a one-line change (omit from the `ops` array).

## 7. Invariants honored

- `engines/` stay pure (no React/DOM/store/nondeterminism); store holds inputs only; one derivation
  point (`useReportView` → `buildEstateDocument`).
- Privacy / no-network, SheetJS pin, telemetry denylist — untouched.
- **i18n parity**: new `dashboard:volumetry.*` keys (title, column headers, total label, the three
  footnotes) in **all four** locales (en/fr/de/it); `keyParity.test.ts` enforces it.
- Base-10 byte formatting via `utils/format`.

## 8. Tests

- `frontEnd.test.ts` (synthetic `makeWorkbook` fixtures): column resolution across the three
  discovered + five FETB header shapes; protected/unprotected bucketing; EXCLUDED → `excludedCount`,
  not totals; uniform-zero column → `undefined` ("–"); absent column → `undefined`; totals sum +
  `≥`/undefined propagation.
- `mergeViews` test: single-server identity; two-server per-type summation; `undefined`-stays-
  `undefined`-until-a-reporter.
- `buildExportModel` test: section shape, TOTAL row, `≥` prefix, EXCLUDED footnote, provenance
  caveat for the NetWorker/summary partial cases and Avamar suppression.
- i18n key-parity (automatic).
- Coverage stays ≥75% on engines/utils.

## 9. Files touched

| File | Change |
|---|---|
| `src/types/reportView.ts` | + `FrontEndTypeRow`, `FrontEnd`, `ReportView.frontEnd`, `MetricKey 'frontEnd'` |
| `src/engines/aggregation/frontEnd.ts` | **new** — `computeFrontEnd` |
| `src/engines/aggregation/provenance.ts` | thread `'frontEnd'` through all helpers |
| `src/engines/products/ppdm/buildPpdmView.ts` | call `computeFrontEnd`; summary branch fills from Count-And-Cap |
| `src/engines/aggregation/summaryView.ts` | populate `frontEnd` (capacity-only) |
| `src/engines/products/networker/buildNetworkerView.ts` | populate `frontEnd` from the workload sheet (keep the GB) |
| `src/engines/products/avamar/buildAvamarView.ts` | `frontEnd` empty → unavailable |
| `src/engines/aggregation/mergeViews.ts` | fold `frontEnd` |
| `src/engines/export/sectionOrder.ts` | + `'volumetry'` SectionId + order placement |
| `src/engines/export/buildExportModel.ts` | + `volumetrySection`, wire into `byId` |
| `src/engines/export/pptx/slidePlan.ts` | special-case `volumetry` → in-place table slide |
| `src/i18n/locales/{en,fr,de,it}/dashboard.json` | + `volumetry.*` keys |
| `*.test.ts` | new + updated tests above |

## 10. Risks

- **Per-sheet column drift** across collector versions — mitigated by the candidate-list resolver and
  `undefined`-on-absent (degrades to "–", never crashes). New names are a one-line list addition.
- **Uniform-zero heuristic** (§1) — validate against additional real exports during implementation.
- **`planSlides` special-case** is the only non-additive touch — covered by a slide-plan unit test
  asserting `volumetry` appears once, in place, not in the appendix.
