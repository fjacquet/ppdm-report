# Graphical Dashboard — Chart-Led Sections (A1)

**Status:** Proposed · **Date:** 2026-06-18 · **Scope:** on-screen dashboard only (export engines unchanged)

## Problem

The exported PPTX/HTML decks are now chart-rich, but the **live dashboard lags them**:
`CoverageSection` is graphical (ECharts donut + per-type stacked bars), yet
`GapsSection`, `JobsComplianceSection`, `CapacitySection`, `PoliciesSection`
still render **tables / KPI-only**, and `IdleAgentsSection` is a plain `<ul>`.
What a user demos on screen no longer matches what they hand over as a deck.

## Goals

- Bring every dashboard section to the **same chart grammar** as the exports, by reusing the existing ECharts `<Chart>` component exactly as `CoverageSection` already does.
- **Preserve on-screen drill-down**: each detail table stays available behind a collapsible "Show details" disclosure (the dashboard is interactive — keep that advantage).
- **No new dependency, no bundle increase** — `BarChart` is already registered in `Chart.tsx`.
- Both themes (light/dark); i18n parity across en/fr/de/it.

## Non-goals (out of scope)

- Lazy-loading ECharts (the 501 KB chunk) — that's the separate **B1** item.
- Any change to the export engines (`buildExportModel`, `pptx/builder`, `assembleHtml`) — unchanged.
- `CoverageSection` (already graphical) and `ExecutiveKpis` (already cards) — untouched.
- No new `ReportView` metrics — read existing fields only.

## Design

### Pattern

Each converted section renders: heading → KPI(s) *(kept)* → an **ECharts bar chart** via `<Chart option={…} dark={dark} ariaLabel="…" />` → for sections with row detail, a **`<Details>`** disclosure wrapping the *existing* table.

- **`<Details>`** is a small shared component over the native, accessible `<details><summary>` element — **no JS state, no new lib**. Summary text = `t('common:showDetails')`. Collapsed by default.
- Bars follow `CoverageSection`'s pattern: a `useMemo`'d `EChartsOption` with a `category` y-axis (labels), a hidden `value` x-axis, and a `bar` series whose per-item `itemStyle.color` comes from the active palette tones. Bar-area height scales with row count (as Coverage does: `Math.max(min, n * rowPx)`).

### Per-section mapping

All inputs already exist on `ReportView`; colours from `DARK`/`LIGHT` palette tones.

| Section (file) | KPIs (kept) | New chart | Collapsible `<Details>` |
|---|---|---|---|
| **Gaps** (`GapsSection.tsx`) | TB unprotected, asset count | horizontal bars: `gaps.top.items` by `sizeGb`, names on the axis, `bad` tone | the current top-N table + `topOf` caption |
| **Jobs** (`JobsComplianceSection.tsx`) | success % | bars: `jobs.counts` (SUCCESS→ok, RETRIED→warn, SKIPPED→muted, CANCELED/FAILED→bad) | status-counts table |
| **Compliance** (same file) | — | three percentage bars (`appConsistentPct`→ok, `replicatedPct`→accent, `immutablePct`→`immutableTone`) | — (no table today) |
| **Capacity** (`CapacitySection.tsx`) | mtree count | bars: `capacity.targets` `utilizationPct`, `warn` when `target.flagged` else `accent` | targets table |
| **Policies** (`PoliciesSection.tsx`) | policy count | bars: `policies.byPurpose` (first purpose → accent, rest → muted) | by-purpose table **and** per-policy table |
| **Idle** (`IdleAgentsSection.tsx`) | agent count | **tile/chip grid** (CSS grid of styled chips) replacing the `<ul>` — mirrors the deck tiles | — |
| **Coverage** (`CoverageSection.tsx`) | unchanged | unchanged (already donut + bars) | unchanged |

Notes:
- Compliance and Idle have no detail table, so no disclosure.
- The capacity `flagged` field already exists (used by the export) — reused for the warn colour; no threshold invented.
- Tone→hex mapping reuses the palette (`palette.ok/warn/bad/accent/excluded/muted`); the export's `toneHex` is in the export engine, so the dashboard maps tones to `palette.*` inline (as `CoverageSection` already does).

### New / changed units

- **Create** `src/components/Details.tsx` — `<Details summary={string}>{children}</Details>` rendering a styled native `<details>` (Tailwind, theme-aware).
- **Modify** the five section components + `IdleAgentsSection` (→ tiles).
- **Add** i18n key `common:showDetails` in all four locales (`en`: "Show details", `fr`: "Afficher les détails", `de`: "Details anzeigen", `it`: "Mostra dettagli") — keeps `keyParity.test` green.
- No `package.json` change.

### Theming

All colours from `DARK`/`LIGHT`. Bar `itemStyle.color` = palette tone. Idle chips use `palette.surface` fill + `palette.accent` left border + `palette.line` border. The ECharts theme (`midnight-light/dark`) already drives axis/label colours via `Chart.tsx`.

### Edge cases

- **Empty data** (no gaps, no targets, empty `byPurpose`/`byType`): skip the chart (guard on length, as Coverage does with `typeNames.length > 0`); render the KPIs/empty-state only.
- **`<Details>`** renders only when the table has rows.
- **Long axis labels** (asset names, hostnames): ECharts `yAxis.axisLabel` with a width/overflow truncation (`overflow: 'truncate'`) so bars don't get squeezed; full names remain in the details table.
- **Idle absent** (`idleAgents` empty): section already omitted upstream.

### Testing

- `src/components/dashboard/sections.test.tsx` + `Dashboard.test.tsx`: for each converted section assert (a) a chart renders (`getByRole('img')` / its `aria-label`), (b) a "Show details" disclosure exists where applicable, and (c) the existing table content now lives **inside** the details element. Move current table-content assertions into the details. Add a `Details.test.tsx` for the disclosure (collapsed by default, summary label, expands).
- Keep the suite green; both themes exercised where the existing tests already do.

## Rollout

Single PR for the dashboard redesign; sections are independent so the work parallelizes cleanly per section.

## Open questions (low-risk defaults chosen)

- Compliance as **bars** (not gauges) — matches the deck and is simpler. ✓
- Idle as a **CSS tile grid** (not an ECharts chart) — it's a list, not a metric series. ✓
- `<Details>` via **native `<details>`** (not a JS-toggled panel) — accessible, zero state. ✓
