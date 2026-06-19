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

## Amendment — format-aware ingestion (ADR 0010)

The runtime merge path has moved from the sheet level to the view level.
`useReportView` now calls `buildReportView(s.workbook)` per server to obtain a
`ReportView`, then folds the results with `mergeViews`
(`src/engines/aggregation/mergeViews.ts`). `mergeWorkbooks` is retained as the
parity reference for the `mergeViews.parity.test.ts` gate but is no longer on
the runtime path. The estate model — warnings, labels, always-warn/never-block
policy, `EstateView` shape — is unchanged. See [ADR 0010](0010-format-aware-ingestion.md).
