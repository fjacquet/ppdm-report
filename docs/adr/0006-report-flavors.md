# ADR 0006 — Two Report Flavors Over One Shared Metric Engine

**Status:** Accepted

## Context

ppdm-report serves two distinct audiences with different priorities. A pre-sales or consulting engagement (Assessment) needs to lead with protection coverage and gap opportunity. An operations team (Ops) needs to lead with job health, SLA compliance, and capacity risk. Maintaining two separate metric engines or two separate data models would double the derivation logic surface and risk inconsistency between the numbers shown to each audience.

## Decision

There is a single `ReportView` type and a single `buildReportView` composition root (`src/engines/aggregation/reportView.ts`). The flavor (`'assessment' | 'ops'`) is a pure ordering and emphasis selector applied at the export layer.

- **Assessment** leads with coverage → gaps/opportunity → immutability value story. Used by `buildExportModel` when `flavor === 'assessment'`.
- **Ops** leads with job health → compliance/SLA → capacity risk. Used when `flavor === 'ops'`.

The slide *set* is identical in both flavors; only the lead order and which KPIs appear in the executive summary change. No metric is computed differently, suppressed, or invented based on flavor.

The `flavor` value is stored as UI state in `src/store/reportStore.ts` (alongside `workbook`) and toggled via `FlavorToggle.tsx`. It is passed through `useExport` → `buildExportModel` at export time; it never enters the metric engines.

## Consequences

- A customer switching between Assessment and Ops views is always looking at the same numbers, reordered.
- There is one place to fix a metric bug; changes propagate to both flavors automatically.
- Adding a third flavor (e.g. executive brief) requires only a new ordering function, not a new engine.
- Tests of metric correctness are flavor-independent.
