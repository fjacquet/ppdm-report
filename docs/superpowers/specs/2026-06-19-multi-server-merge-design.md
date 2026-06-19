# Multi-Server Merge — Design

**Date:** 2026-06-19
**Status:** Approved (design); pending implementation plan
**Topic:** Upload multiple Live Optics PPDM `.xlsx` exports, merge them into one estate, and produce a combined report with a per-server breakdown.

## Problem

A customer with several PPDM servers runs one Live Optics collection per server, producing several `.xlsx` exports. Today the app accepts exactly one file (`useReportUpload` takes `files?.[0]`; the store holds a single `workbook`). ADR 0002 explicitly scoped out multi-extract merge for v1. We now want to combine N exports into a single report while keeping each server's contribution visible.

## Goals

- Accept multiple `.xlsx` files (drop or pick), additively (drop more later without losing what's loaded).
- Produce one **combined estate** report (coverage, gaps, jobs, compliance, capacity, policies) across all servers.
- Add a **per-server breakdown** so the reader can see which server contributes what.
- Honor the "no silent caps" invariant (ADR 0004): every merge-related caveat is surfaced as a warning; **never block** (per decision below).
- Keep single-file behavior **byte-for-byte unchanged**.

## Non-Goals (YAGNI)

- No trend/time-series analysis across snapshots.
- No live PPDM API access (ADR 0001/0002 unchanged).
- No de-duplication of overlapping assets — concatenate and warn on suspected duplicate files only.
- No full comparison *table* in the PPTX/HTML exports in base scope (bars only); deferrable.

## Decisions (from brainstorming)

1. **Report shape:** Combined estate **plus** a per-server breakdown.
2. **Merge safety:** **Always warn, never block.** Mismatched exports merge anyway with a prominent caveat.
3. **Server label:** PPDM appliance **Host Name** from the `System Information` sheet; fall back to Project Name (`meta.customer`), then filename. Collisions get ` (2)`, ` (3)` suffixes.
4. **Customer:** Single customer across all servers by design — `meta.customer` is the shared value (take the first; no joining). Presentation can adapt later if needed.

## Architecture

### The seam

The entire pipeline funnels through one type, `ParsedWorkbook` (`meta` + `sheets` + `inUse`/`idleAgents` + `warnings`). `buildReportView(wb: ParsedWorkbook): ReportView` is a **pure** composition root; the dashboard and both exports are pure functions of `ReportView`. Therefore:

- **Combined view** = `buildReportView(mergeWorkbooks(servers))`.
- **Per-server breakdown** = `servers.map(buildReportView)` — the existing, already-tested per-workbook logic, reused N times.

Result: the 6 aggregation engines and both export renderers need **no changes** to compute per-server numbers. All genuinely new logic lives in one pure `mergeWorkbooks` function plus a thin UI/derivation layer.

### Data model

```ts
// types/ppdm.ts
export interface ServerWorkbook {
  /** PPDM appliance Host Name; falls back to Project Name, then filename. */
  label: string
  workbook: ParsedWorkbook   // exactly today's parsed shape, unchanged
}
```

```ts
// types/reportView.ts
export interface EstateView {
  combined: ReportView                                    // buildReportView(merged)
  perServer: Array<{ label: string; view: ReportView }>   // servers.map(buildReportView)
  multiSource: boolean                                    // servers.length > 1
}
```

**Store** (`store/reportStore.ts`): replace `workbook: ParsedWorkbook | null` with:
- `servers: ServerWorkbook[]` (`[]` when nothing loaded)
- actions: `addServers(s: ServerWorkbook[])` (append), `removeServer(label)`, `clear()`
- `flavor` unchanged.

**Derivation** (`hooks/useReportView.ts`) returns `EstateView | null`:
- `servers.length === 0` → `null`
- else `{ combined: buildReportView(mergeWorkbooks(servers.map(s => s.workbook))), perServer: servers.map(s => ({ label: s.label, view: buildReportView(s.workbook) })), multiSource: servers.length > 1 }`

### Merge semantics — `mergeWorkbooks(wbs: ParsedWorkbook[]): ParsedWorkbook`

Pure. Returns the same `ParsedWorkbook` shape the app already consumes.

- **`sheets`**: union all sheet names. For each name across servers that have it:
  - `rows`: concatenate in upload order.
  - `headers`: union, first-seen order preserved, de-duplicated (collector-build differences tolerated by the keyed-row model).
  - `capped`: logical OR.
- **`inUse` / `idleAgents`**: re-run the existing `classifyAgents` on the merged sheet list (do not union flags). An agent idle on A but in use on B is "in use" for the estate.
- **`meta`** (`CaptureMeta`):
  - `customer`: first server's (shared by design).
  - `capturedAt`: the **latest** snapshot date.
  - `baseTen`: uniform value if all agree; otherwise keep one and raise the unit-mismatch warning.
  - `projectId` / `collectorBuild`: first server's; mixed builds noted in warnings.
- **`warnings`** (always-warn lives here; `ParsedWorkbook.warnings` already flows untouched into dashboard + both exports):
  1. Carry over every source warning, **prefixed with its server label** (`[ppdm-paris] Sheet "Copies" reached the 10,000-row cap…`).
  2. **Unit mismatch:** base-10 + base-2 sources present.
  3. **Duplicate suspicion:** two servers with the same Host Name *or* same `projectId + capturedAt`.
  4. **Cap aggregation:** per sheet, "reached the 10k cap in Z of N servers; combined figures blend independent windows."

`mergeWorkbooks([wb])` is a near-identity (single source: no merge warnings, meta unchanged), guaranteeing single-file output is unchanged.

> **Note on base-10/base-2:** the app currently surfaces only utilization % and mtree counts for capacity — neither sums raw bytes — so a unit mismatch affects honesty-of-labeling more than numeric correctness today. The warning is still raised.

### Label derivation — `deriveLabel(workbook, filename): string`

Separate tiny helper, run once per file at upload (not inside the pure merge):
1. `workbook.sheets['System Information'].rows[0]?['Host Name']` if non-empty.
2. else `workbook.meta.customer` if non-empty.
3. else filename without `.xlsx`.
Collisions across the loaded set get ` (2)`, ` (3)` suffixes (resolved at the store/upload layer over the whole set).

### Upload flow

- **`UploadZone`**: add `multiple` to the `<input>`; iterate `dataTransfer.files` / `e.target.files` instead of `[0]`; filter `.xlsx`.
- **`useReportUpload`**: for each file → `parseInWorker(file)` → `deriveLabel` → `ServerWorkbook`; then `addServers([...])` (append, not replace). **Per-file resilience:** files parse independently; a failure surfaces for that file only and the rest still load (never blocks the batch). The singleton worker queues concurrent calls by message id — no worker changes.
- **`ServerList`** (new presentational component): one chip per server (`label · captured date · ✕ remove`) + a `Clear all` control. Appears once anything is loaded. Single-server view is visually unchanged apart from one removable chip.

### Dashboard & exports

- **`PerServerSection`** (new dashboard component): rendered only when `estate.multiSource`, after `ExecutiveKpis`. Chart-led (reuse `Chart` + `barOption`): bar chart of **coverage %** per server, plus a React comparison table (servers × {coverage %, unprotected count & TB, job success %, captured date, PowerProtect version}). Values read from `estate.perServer[i].view.*`; nothing recomputed.
- **`Dashboard`** prop changes from `ReportView` to `EstateView`; passes `estate.combined` to every existing section unchanged.
- **Exports — no renderer changes.** Both exports are deck-driven (`assembleHtml` renders each section from its `deck`; `planSlides` pairs sections, special-casing only `idle`). Add one `perServerSection: ExportSection | null` in `buildExportModel` (null unless multi-source, mirroring `idleSection`), expressed via `deck.bars` (one bar per server = coverage %) + `deck.kpiChips` (server count, weakest server). It flows through `planSlides` and `assembleHtml` automatically — **no changes to `builder.ts`, `slidePlan.ts`, `assembleHtml.ts`**.
  - `buildExportModel` gains an optional `perServer` argument; `useExport`/`ExportButtons` pass `estate.perServer`.
  - New `SectionId 'perServer'` in `sectionOrder.ts`, positioned first for both flavors; filtered out when single-source.
  - **Optional, out of base scope:** (a) full-width slide like `idle` (generalize the one `idle` special-case in `planSlides`); (b) full comparison *table* in exports (small extension to both renderers to honor `s.table`).
- **`ExportButtons`** prop changes from `ReportView` to `EstateView`.

### i18n

New keys across all 4 locales (`en/de/fr/it`, `common.json` + `dashboard.json`): `perServer.title`, comparison column labels, `multiSource.*` warning strings. `keyParity.test.ts` enforces parity.

## Error handling

- Bad/unparseable file → error surfaced for that file; batch continues (never-block).
- Non-`.xlsx` → ignored at intake (as today).
- Mismatched units / suspected duplicates / capped sheets → warnings in the report, never a hard stop.
- 0 servers → `null` view → upload zone only (as today).

## Testing

- **Invariant:** `buildReportView(mergeWorkbooks([wb]))` deep-equals `buildReportView(wb)` on `ref/PPDM.xlsx` — locks "single file unchanged"; existing suite is the regression net.
- **`mergeWorkbooks` units:** row concat per sheet; header union; `capped` OR; `inUse`/`idleAgents` re-derivation (idle-on-A + in-use-on-B → in-use); meta fold (shared customer, latest `capturedAt`); each warning class.
- **`deriveLabel` units:** Host Name → customer → filename chain; collision suffixing.
- **Store/derivation:** `addServers` append, `removeServer`, `clear`; `EstateView` at 0/1/2 servers (`multiSource` flips at 2).
- **Components:** UploadZone multi-file intake + per-file resilience; ServerList chip render/remove; PerServerSection present only when multi-source.
- **Export:** `buildExportModel` emits `perServer` only when multi-source; bars = per-server coverage %; `keyParity` stays green.
- **Fixture:** one synthetic second-server workbook (distinct Host Name, overlapping + idle agents, a capped sheet).

## Docs

- Update ADR 0002 (currently states "No multi-extract merge in v1").
- Add a short ADR for the estate model (`mergeWorkbooks` + `EstateView`, reuse-`buildReportView` rationale).
- Touch README + USER-GUIDE for the multi-file flow.

## Effort

≈ 2.5–4 focused days at repo quality bar. Combined-estate-only (no breakdown) ≈ 1 day; per-server breakdown + export wiring + file-management UX bring it to ~3 days. The clean `ParsedWorkbook` seam is why it's days, not weeks.

| Area | Rough size |
|---|---|
| `mergeWorkbooks` + warnings + tests | ~1 day |
| `deriveLabel` + tests | ~2h |
| Store + `EstateView` derivation | ~½ day |
| Upload UX (multi-file, resilience, `ServerList`) | ~½ day |
| `PerServerSection` (chart + table) | ~½ day |
| Export integration (no renderer changes) | ~½ day |
| i18n (4 locales) + docs/ADRs | ~½ day |

## Risks

1. A second *realistic* fixture takes care to craft.
2. Full comparison tables in exports (vs bars) deferred out of base scope; small renderer extension if wanted later.
3. Many large files parse sequentially in the worker — acceptable, but parse time adds up.
