# ADR 0010 — Format-Aware Ingestion: Summary vs Detail PPDM Exports

**Status:** Accepted

## Context

Dell Live Optics produces two distinct PPDM export formats. The current format
("detail") contains one row per asset across ~31 sheets, giving per-asset
granularity for coverage breakdown by type, the unprotected-asset list, copy
compliance (immutability / replication), and storage-target utilization. Older
exports ("summary") carry pre-aggregated sheets — named with the pattern
`... Count And Cap` or `... Assets & Cap` — plus a `System Configuration`
key/value sheet, and no per-asset rows. Customers with older PPDM releases
produce summary exports; they need to be able to load them alongside detail
exports when building a multi-server estate report.

The earlier estate merge (ADR 0009) fused N `ServerWorkbook`s at the sheet
level inside `mergeWorkbooks`, then called `buildReportView` once on the merged
`ParsedWorkbook`. That approach cannot tolerate mixed-format inputs: concatenating
pre-aggregated summary sheets with per-asset detail rows would produce meaningless
totals.

## Decision

**Format detection.** `detectFormat` (`src/engines/parser/detectFormat.ts`)
inspects the sheet names of a `ParsedWorkbook` and returns `'summary'` when both
a `System Configuration` sheet and at least one `Count And Cap` / `Assets & Cap`
sheet are present; otherwise `'detail'`. The return type is the union
`WorkbookFormat = 'detail' | 'summary'`.

**Format-aware dispatch in `buildReportView`.** The composition root
(`src/engines/aggregation/reportView.ts`) calls `detectFormat` before
dispatching:

- `'detail'` — existing path: runs all six aggregation engines
  (`computeCoverage`, `findGaps`, `computeJobs`, `computeCompliance`,
  `computeCapacity`, `summarizePolicies`) and stamps provenance with
  `allAvailable`.
- `'summary'` — delegates immediately to `summaryView`
  (`src/engines/aggregation/summaryView.ts`), which reads the pre-aggregated
  sheets directly and stamps provenance with `allUnavailable`.

**`summaryView` recovers what summary exports carry.** Overall protection counts
(`Number of Protected Assets`, `Number of UnProtected Assets`), overall
coverage, unprotected capacity (summed across per-type `Count And Cap` sheets),
job result distribution (from `Jobs Summary`), policy list (from `Policies`),
in-use agent types (from per-type `Asset Count` > 0), and Data Domain mtree
count (row count of `Data Domain Mtrees`) are all recovered. These match the
columns the detail path derives from raw rows.

**The four detail-only metrics are unavailable for summary exports.** Because
summary files carry no per-asset rows, the following four `MetricKey` slots are
marked `available: false` via `allUnavailable`:

| `MetricKey` | Metric |
|---|---|
| `coverageByType` | Per-type coverage breakdown (protected / unprotected / excluded per agent type) |
| `gapsList` | Unprotected-asset list (name, type, size) |
| `compliance` | Copy compliance: app-consistency, immutability, and replication percentages |
| `storageTargets` | Storage-target utilization (Data Domain / protection storage targets) |

The dashboard and exports surface these as "not available" with a coverage note
indicating how many servers contributed that metric.

**Additive provenance model.** `MetricProvenance` (`src/types/reportView.ts`)
carries `{ available, serversCovered, serversTotal }` for each `MetricKey`.
`mergeViews` (`src/engines/aggregation/mergeViews.ts`) aggregates provenance
across per-server `ReportView`s: a merged metric is `available` when at least
one server covers it, and `serversCovered` counts exactly how many do. For the
`compliance` key an additional `assetsCovered / assetsTotal` ratio is carried to
support proportional display.

**Merge path moved to the view level.** The runtime merge path moves from
sheet-level (`mergeWorkbooks` operating on `ParsedWorkbook`s) to view-level
(`mergeViews` operating on `ReportView[]`). The derivation hook
`useReportView` calls `buildReportView(s.workbook)` for each server, then folds
the resulting `ReportView[]` with `mergeViews`. Estate warnings (unit-mismatch,
suspected duplicates, capped sheets, mixed formats) are applied by
`estateWarnings` (`src/engines/parser/estateWarnings.ts`) on top of the merged
view — this is unchanged from ADR 0009.

`mergeWorkbooks` (`src/engines/parser/mergeWorkbooks.ts`) is **intentionally
retained** after this change. It is not on the runtime path but serves as the
reference implementation for the parity test (`mergeViews.parity.test.ts`),
which verifies that `mergeViews` and `mergeWorkbooks` + `buildReportView` yield
numerically identical results on detail-only inputs.

**Estate semantics unchanged.** Warning logic, server labels (appliance Host
Name → Project Name → filename), the always-warn/never-block policy, and the
`EstateView` shape (`combined` + `perServer` + `multiSource`) are all unchanged
from ADR 0009.

## Consequences

- Older summary-format PPDM exports can be loaded and merged with current
  detail exports without error or silent data corruption.
- The four detail-only metrics show an explicit "not available" indicator when
  any contributing server is a summary export; the dashboard never silently
  drops or zeroes them without disclosure.
- `buildReportView` remains the single composition root; callers are unaffected
  by format detection.
- `mergeWorkbooks` is kept as a parity reference and must not be deleted.
- Adding a new detail-only metric requires updating `MetricKey`, `allAvailable`,
  `allUnavailable`, and `mergeProvenance` in `mergeViews`.
