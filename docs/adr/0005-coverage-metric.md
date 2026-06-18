# ADR 0005 — Coverage Metric: PROTECTED/(PROTECTED+UNPROTECTED) Leads; EXCLUDED Never Silent

**Status:** Accepted

## Context

PPDM assigns each asset one of three protection statuses: `PROTECTED`, `UNPROTECTED`, or `EXCLUDED`. `EXCLUDED` assets are explicitly opted out of protection by an administrator (e.g. test VMs, staging systems). Including `EXCLUDED` in the denominator of the headline coverage figure would deflate the number and misrepresent the organisation's deliberate protection posture. Excluding `EXCLUDED` entirely — without disclosing its existence — would overstate coverage and obscure a potential gap.

## Decision

Coverage is expressed as two figures, both always shown:

1. **Headline:** `PROTECTED / (PROTECTED + UNPROTECTED)` — the primary protection coverage rate, reflecting assets that should be protected. This is the figure cited in executive summaries and KPI bands.
2. **Secondary:** `PROTECTED / (PROTECTED + UNPROTECTED + EXCLUDED)` — the "including excluded" rate, shown alongside the headline as context.

The `EXCLUDED` count is always disclosed; it is never silently folded into either denominator or dropped from the UI.

This is implemented in `src/engines/aggregation/coverage.ts` as `CoverageBand.pct` (headline) and `CoverageBand.pctInclExcluded` (secondary). Both fields are populated for every asset type and for the overall estate. The `EXCLUDED` count is carried as `CoverageBand.excluded` and rendered in the coverage section and per-type slides.

## Consequences

- Customers with a large number of intentionally excluded assets see an accurate headline that reflects active protection decisions, while the secondary figure provides full transparency.
- The design prevents accidental misrepresentation in either direction.
- Any future status values introduced by PPDM must be explicitly categorised before they are included in or excluded from the metric.
