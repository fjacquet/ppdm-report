# PPDM Report — Graphical Two-Band Deck Redesign (PPTX)

**Status:** Proposed · **Date:** 2026-06-18 · **Scope:** PPTX export only (HTML export is a fast-follow)

## Problem

The exported PPTX decks are accurate but read as **empty and tabular**. Across a typical
10-slide deck:

- Only **one** chart exists (the coverage doughnut); every other section is KPI text + a table.
- Content clusters in the top third; the bottom two-thirds is white space.
- The unprotected-assets table overflows onto a second, ~80%-empty slide.
- Tables replicate what the Excel source already provides ("we already have Excel").

The on-screen dashboard is chart-rich; the deck should be too.

## Goals

- Every slide carries a visual and **fills its space** at a normal, professional scale — no oversized "hero" charts.
- **Replace data tables with charts.** Keep all the numbers, shown visually.
- **Native (editable) pptxgenjs charts** — no rasterized images, no new dependencies.
- Works for **both themes** (light/dark) and **both flavors** (assessment/ops).
- **No new metrics** — read existing `ReportView` / `ExportModel` fields only.

## Non-goals (explicitly deferred)

- **HTML export redesign** — shares the same `ExportModel` and has the same problem; it will get the same band/chart grammar in a **separate fast-follow plan**.
- No ECharts image rasterization (decided against: editability + robustness win).
- No new `ReportView` metrics or recomputation.

## Design

### Layout grammar

Slide canvas stays `LAYOUT_WIDE` (13.33 × 7.5"). Two archetypes:

1. **Band slide** (hosts a *pair* of sections): two full-width **horizontal bands** (top + bottom) separated by a thin divider line. Each band =
   - **Label zone** (left, ~2.15" wide): section title, one-line subtitle, and either KPI chips *or* a small doughnut (rounded-rectangle shapes + text).
   - **Chart zone** (right, fills remaining width): one chart — a **horizontal bar chart** in most sections — spanning the full width of the band.
2. **Full-width single**: used for **Title**, **Executive summary**, and **Idle agents**.

This is the grammar validated with the user via interactive mockups (the "two sections, stacked horizontally, full width" direction). Side-by-side columns and oversized single-section visuals were both rejected as looking sparse/unprofessional.

### Slide plan / pairing

- Render order follows `SECTION_ORDER[flavor]`.
- **Idle agents** is extracted into its **own full-width slide** at its ordinal position in the order.
- The remaining **six** sections (`coverage, gaps, jobs, compliance, capacity, policies`) are paired **consecutively** in flavor order → **three band slides**. Six is always even, so pairing is always clean.
- Net: **Title + Executive summary + 3 band slides + Idle = ~6 slides** (down from ~10).

**Assessment** (`coverage, gaps, idle, jobs, compliance, capacity, policies`):

| # | Slide | Type |
|---|---|---|
| 1 | Title | full-width single |
| 2 | Executive summary | full-width single |
| 3 | Asset coverage ▸ Protection gaps | band slide |
| 4 | Idle agents | full-width single |
| 5 | Job activity ▸ Compliance | band slide |
| 6 | Capacity ▸ Policies | band slide |

**Ops** (`jobs, compliance, capacity, coverage, gaps, idle, policies`):

| # | Slide | Type |
|---|---|---|
| 1 | Title | full-width single |
| 2 | Executive summary | full-width single |
| 3 | Job activity ▸ Compliance | band slide |
| 4 | Capacity ▸ Asset coverage | band slide |
| 5 | Protection gaps ▸ Policies | band slide |
| 6 | Idle agents | full-width single |

### Per-section visual mapping

All inputs already exist on `ReportView` / `ExportModel` (no new metrics):

| Section | Label zone | Chart zone | Source fields |
|---|---|---|---|
| **Executive summary** | — | 4 KPI cards + a 100%-stacked **protection-posture bar** | `coverage.overall`, `gaps.totalCapacityGb`, `jobs.successPct`, `compliance.immutablePct` |
| **Asset coverage** | small doughnut (protected/unprotected/excluded) | horizontal **per-type coverage bars** | `coverage.overall`, `coverage.byType[].pct` |
| **Protection gaps** | 2 KPI cards (TB, asset count) | horizontal **top-N unprotected-by-size bars**, asset name as the row label | `gaps.totalCapacityGb`, `gaps.count`, `gaps.top.items[].{name,sizeGb}` |
| **Job activity** | KPI chips (success %, retried) | horizontal **status bars** (success/retried/skipped/canceled, tone-colored) | `jobs.successPct`, `jobs.counts` |
| **Compliance** | — (title + sub) | three full-width **percentage bars** (app-consistent/replicated/immutable) | `compliance.appConsistentPct / replicatedPct / immutablePct` |
| **Capacity** | KPI chips (mtree count; *N targets ≥ 85%*) | horizontal **utilization bars**, dashed **85% threshold line**, bars ≥85% in `warn` tone | `capacity.targets[].{name,utilizationPct}`, `capacity.mtreeCount` |
| **Policies** | KPI chip (policy count) | horizontal **by-purpose bars** | `policies.count`, `policies.byPurpose` |
| **Idle agents** | KPI chip (count) | full-width **tile grid**, one tile per agent type, *complete (never truncated)* | `idleAgents[]` |

Notes:
- "Idle agents" is intentionally a **complete "buy list"** — a prompt for what else could be onboarded. It must never be reduced or truncated.
- *N targets ≥ 85%* is a trivial presentation-level count over the existing `capacity.targets`, not a new metric.
- The **capped-window caveat** (jobs/compliance) and **base-10 footer** are preserved as today, rendered as small muted notes.

### pptxgenjs primitives (verified against `/gitbrent/pptxgenjs` docs)

- **KPI card / tile**: `slide.addText(content, { shape: pptx.shapes.ROUNDED_RECTANGLE, rectRadius, fill, line, align, valign })` — one call renders a filled rounded card with text.
- **Horizontal bar chart**: `slide.addChart('bar', [{ name, labels, values }], { barDir: 'bar', chartColors, showValue, dataLabelPosition })`. `barDir: 'bar'` = horizontal; `chartColors` maps per row/point.
- **Doughnut**: `slide.addChart('doughnut', […], { holeSize, showLegend, legendPos })`.
- **Divider / threshold line**: `slide.addShape(pptx.shapes.LINE, { line: { color, dashType: 'dash' } })`.
- **Posture bar**: a 100%-stacked bar (or three adjacent `RECTANGLE` shapes) sized to protected/unprotected/excluded proportions.

### Data-model changes (`src/engines/export/types.ts`)

- Extend `ExportChart` to express horizontal bars: add `kind: 'donut' | 'hbar'`; keep `slices` (row label = `name`, magnitude = `value`, tone = `color`); add `valueLabels?: string[]` (already-localized end labels, e.g. `"11.0 TB"`, `"93%"`); add `threshold?: { value: number; label: string }` for the capacity marker.
- Allow a section to carry a **primary chart** (chart zone) plus an optional **mini doughnut** (label zone, coverage) and **KPI chips**; add `subtitle?` and `tiles?: string[]` (idle). **Remove `table` from the rendered path** — tables are gone.
- Exact field names finalized in the implementation plan; the principle is: the worker-serializable model stays pure data, builder only lays out.

### Builder changes (`src/engines/export/pptx/builder.ts`)

- New focused helpers: `drawKpiCard`, `drawDivider`, `drawBand(section)`, `drawHBar`, `drawDonut`, `drawPostureBar`, `drawTileGrid`.
- `buildPptx`: Title → Executive summary → iterate the **slide plan** (band slides + idle single), selecting helpers per section.
- Delete the generic `addSection` table branch.

### `buildExportModel.ts` changes

- Attach a chart to **every** section; stop emitting `table` objects.
- Derive slices + localized `valueLabels` per the mapping table above.
- Gaps bars capped at **top 10** (via the existing `TopList`); footnote "Top 10 of {total} — full list in the Excel export."
- Build `tiles` from `idleAgents`.

### Theming

- Drive all fills/ink/lines/tones from `LIGHT` / `DARK` palettes (`src/theme/palette.ts`).
- KPI cards/tiles need a **surface** color distinct from the slide background (esp. in dark theme, where cards must be lighter than `bg`). **Add a `surface` token to `Palette`** for both themes (small, additive change).

### Edge cases

- **Empty section** (e.g. `gaps.count === 0`, no capacity targets, empty `byType`/`byPurpose`): render a short empty-state line in the band instead of a chart, so the band still balances.
- **Idle absent** (`idleAgents.length === 0`): no idle slide (current behavior).
- **Long asset names**: truncate bar row labels with an ellipsis; full names live in Excel.
- **Many capacity targets**: cap utilization bars to top N by utilization; note the cap.
- **i18n**: all text Arial; layout stays LTR (matches the current deck) — RTL is a known limitation, out of scope here.
- **Capped window**: caveat note persists on jobs/compliance bands.

### Testing

- `buildExportModel.test.ts`: each section yields the expected chart slices + localized value labels from a fixture `ReportView`; no `table` objects; gaps capped at 10; `tiles` length = `idleAgents` length.
- `builder.test.ts`: slide count per flavor matches the inventory; each band emits a chart (not a table); KPI cards/tiles present; capacity threshold present when targets ≥ 85% exist; light vs dark select the correct palette.
- Update existing export tests to the new expectations; keep the suite green.
- Manual verification: export both themes × both flavors from the app; render to PDF via LibreOffice (`soffice --convert-to pdf`) and eyeball that no slide is half-empty and no tables remain.

## Rollout

Single PR for the PPTX redesign. HTML export redesign follows in its own plan using the same grammar.

## Open questions (low-risk defaults chosen)

- Add `surface` palette token? — **Yes** (needed for legible cards in dark theme).
- Gaps top-N — **10**. Capacity bars — **all targets**, `warn` tone ≥ 85%.
