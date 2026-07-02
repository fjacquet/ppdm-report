# Insight Families: Reliability, Efficiency, Capacity Trend, Hygiene — Design

**Date:** 2026-07-02
**Status:** Approved (pending implementation)
**Driving data:** 8 real JTI workbooks (7 Avamar grids: GERTRI01-AVN106, POLGST01-AVN104, SWIGVA01-AVU203/221/222/223/224; 1 NetWorker lab: NetworkerNwt00-lab)

## Problem

The Avamar and NetWorker adapters consume a fraction of what Live Optics exports contain. Whole sheets (`Node Utilization` time series, `Policy Capacity-Retention`, `KPIs`, `Client Statistics`, `Licenses`, the "Not In Use" config sheets) and rich columns (`% Common`, `Bytes Mod And Sent`, `Encrypted`, `Time Queued`, `Data Reduction Ratio`) are ignored. The report can detect materially more patterns — reliability, efficiency, growth, and waste — without any new data source.

## Decisions made during brainstorming

- **Audience:** both flavors. Engine computes everything once; assessment flavor surfaces summarized findings, ops flavor surfaces actionable lists.
- **Scope:** four insight families, priority order: (1) reliability patterns, (2) efficiency & retention profile, (3) capacity trend, (4) config hygiene & waste.
- **Predictive numbers:** observed trend only. Report measured growth (e.g. "+1.2 pts/month over the 12-month window"); no days-to-full projection, no extrapolation.
- **Architecture:** shared pattern engines — pure aggregation modules with normalized input types; product adapters map sheets to normalized rows. No per-product math duplication, no generic detector framework.
- **Delivery:** four sequential PRs to main, one per family, in priority order. Each PR ships engine + adapters + UI + PPTX/HTML export + i18n (×4) + tests.

## Architecture

Four new flat pure modules in `src/engines/aggregation/`, following the existing `coverage.ts` / `jobs.ts` / `frontEnd.ts` pattern:

```
reliability.ts     computeReliability(jobs: ReliabilityJob[], opts): Reliability
efficiency.ts      computeEfficiency(inputs: EfficiencyInputs): Efficiency
capacityTrend.ts   computeCapacityTrend(samples: UtilizationSample[]): CapacityTrend
hygiene.ts         computeHygiene(items: HygieneItem[]): Hygiene
```

Each module exports its normalized input type(s), a compute function, and a result type carrying `MetricProvenance`. Product adapters (`buildAvamarView`, `buildNetworkerView`) map their sheets into the normalized rows and attach the result to `ReportView`. `buildPpdmView` can fill `ReliabilityJob` from its existing activities data in a later pass; until then PPDM marks the families unavailable via provenance.

`ReportView` gains four optional fields — `reliability?`, `efficiency?`, `capacityTrend?`, `hygiene?` — same optional-with-provenance shape as `opsInsights` and `frontEnd`. The single derivation point (`useReportView` → `buildEstateDocument`) is unchanged.

**Never ingest pre-baked vendor KPI values as metrics.** The lab NetWorker `KPIs` sheet reports "System Monthly Growth Percentage = 4074%" — vendor-computed aggregates are unreliable. We compute from raw rows; the only KPI-sheet values we read are the retention-bucket capacities (raw sums, not derived rates), because NetWorker exposes retention capacity nowhere else.

## Family 1 — Reliability (`reliability.ts`)

**Input:** `ReliabilityJob { host: string; status: 'success' | 'exception' | 'failed'; day: string /* ISO date */; durationHours?: number; queuedHours?: number }`

**Metrics:**

1. **Repeat-failure clients.** Group by host. Flag a client when it has ≥1 failed job on **≥3 distinct days** within the observation window. Report per flagged client: failure-day count, total failed jobs, and days since last successful job (∞ if none in window). Sorted by failure-day count descending. Assessment shows top 5 + total count; ops shows the full list.
2. **Runtime distribution.** Histogram of `durationHours` in the Live Optics buckets: ≤15 min, 15–30 min, 30–60 min, 1–2 h, 2–4 h, 4–8 h, >8 h. Computed from detail rows; when detail durations are absent, fall back to Avamar's pre-aggregated `Backup Runtime Summary` sheet (raw counts, acceptable per the KPI rule since they are sums not rates).
3. **Queue delay.** Share of jobs with `queuedHours` > 0.25 (15 min), plus the top offenders (host, queued hours, day). Provenance-unavailable when no queued timestamps exist.

**Sources:**

- Avamar: `Avamar DPN Summary` (Host, Start Date, Status → status mapping reuses the existing jobs.ts status strings) for failure streaks; `Job List Detailed` (`Total Hours (Queued + Running)`, `Time Queued (GMT)`, `Time Started (GMT)`) for durations and queue delay (queued = started − queued timestamps).
- NetWorker: `Jobs` (Client Name, Completion Status, Start Time, End Time) for streaks and durations; `Client Statistics` `Success Rate` as a per-client corroboration column in the ops table. No queued timestamp → queue delay unavailable.
- Exception statuses count as neither success nor failure for streak purposes (consistent with existing success-rate treatment); a failure "streak day" requires ≥1 `failed` job.

## Family 2 — Efficiency & retention profile (`efficiency.ts`)

**Input:** `EfficiencyInputs { dedupe?: DedupeJob[]; retention?: RetentionBucketInput[]; encryption?: EncryptionJob[] }` — each sub-metric independently optional and provenance-guarded.

**Metrics:**

1. **Dedupe efficiency.**
   - Avamar: capacity-weighted mean of `% Common` from `Avamar DPN Summary` (weight = `Bytes Processed`), plus a low-dedupe client list (clients whose weighted `% Common` < 50% with meaningful processed bytes).
   - NetWorker: global ratio `Used Logical Capacity / Used Capacity` from `Data Domains`, plus capacity-weighted mean of `Data Reduction Ratio` from `Dedup Jobs`.
2. **Daily change rate.** Avamar only: capacity-weighted `Bytes Mod And Sent / Bytes Processed` across DPN Summary rows. NetWorker unavailable.
3. **Retention profile.** Shared output `RetentionBucket[]` with fixed labels: `<30d, <60d, <180d, <1y, <7y, ≥7y`, each carrying capacity in GB (product-native units; Avamar values are GiB base-2, NetWorker TB→GB base-10 — display goes through the existing `baseTen` formatting path).
   - Avamar: `Policy Capacity-Retention` sheet (per policy type; also keep the per-policy-type split for the ops table).
   - NetWorker: `KPIs` rows `Total Capacity with Retention < 30 Days (TB)` … `>= 7 Years (TB)`.
4. **Encryption coverage.** Avamar only: % of jobs and % of capacity with `Encrypted` ≠ false/empty in `Job List Detailed`. NetWorker unavailable.

**Merge rule:** never average averages — merge at the weighted-sum level (carry numerator/denominator in the result type so `mergeViews` can fold exactly). Retention buckets sum per label.

## Family 3 — Capacity trend (`capacityTrend.ts`)

**Input:** `UtilizationSample { day: string; target: string; pct: number }` — target is `server/node` (e.g. `GERTRI01-AVN106/0`) so multi-grid merges keep per-node series distinct.

**Output per target:** current % (latest reading), window min/max, observation window (first/last day, sample count), and **observed slope in percentage-points per 30 days via least-squares linear regression** over the window. Plus the (downsampled if needed) series for the line chart. Targets with fewer than 30 daily samples report current value but mark the slope unavailable.

**Framing:** slope is presented as a measurement — "grew +1.2 pts/month over the last 12 months" — never as a projection. No days-to-threshold number anywhere.

**Sources:** Avamar `Node Utilization` (Date, Node, Max Utilization %; 366 daily rows per node in the JTI files). NetWorker `Data Domains` is a snapshot → trend unavailable (current DD utilization remains covered by the existing storage-targets metric).

## Family 4 — Config hygiene & waste (`hygiene.ts`)

**Input:** `HygieneItem { kind: 'dataset-unused' | 'retention-unused' | 'schedule-unused' | 'client-inactive' | 'client-overtime' | 'license'; name: string; detail?: string; expiresOn?: string }`

**Output:** count per kind + item lists + a total cleanup-opportunities count. License items get a status: `ok` ("Authorized - No expiration date" or expiry > 90 days), `expiring` (≤ 90 days), `expired`.

**Sources:**

- Avamar: `Dataset Not In Use`, `Retention Not In Use`, `Schedule Not In Use`, `Inactive Clients` (AVU203 has 170), `Overtime Clients` (count-level; full list in ops). Disabled groups remain where they already live (idle list) — not duplicated here.
- NetWorker: `Licenses` (parse `Expiration Date`; text value "Authorized - No expiration date" → `ok`).

## Merging (estate of 7 Avamar grids + 1 NetWorker)

In `mergeViews`:

- Lists concatenate; entries are prefixed with the source server name when host names alone would be ambiguous (reuse the existing multi-server labeling convention).
- Weighted metrics fold via carried numerator/denominator pairs.
- Utilization series union by `server/node` target key.
- Retention buckets sum per label within a product group; the estate view keeps per-product sections (existing `EstateDocument` structure), so base-2/base-10 units never mix in one number.
- Single-source input remains an identity (existing invariant, extended to the four new fields).

## Rendering

- **Sections:** each family is one section rendered through the existing `ExportSection` machinery (KPI row + tables), so dashboard, HTML export, and PPTX appendix come from one description. Section order: reliability and capacity trend join the risk/exposure part of the deck; efficiency/retention and hygiene join the optimization part.
- **Flavors:** assessment = one KPI + takeaway line per family (e.g. "4 clients failed on 3+ days — remediation needed"); ops = adds the full tables (failure list with per-client success rate, low-dedupe clients, per-node trend table, inactive-client and unused-config lists). Same engine output; only `planSlides` emphasis and table inclusion differ.
- **Chart:** one new option builder `capacityTrendOption.ts` (line chart, one series per node, 80% reference line as a *current-state* marker, not a projection) rendered through `Chart.tsx` — preserves the one-ECharts-import rule.
- **Tone:** thresholds added to `thresholds.ts`: repeat-failure clients >0 amber / ≥5 red; queue-delayed share >10% amber; change rate >10%/day amber; dedupe <50% (Avamar % Common) amber; utilization slope tone is paired with current level (high slope + >60% current = red; high slope alone = amber); any expired license red, expiring amber. Every rendered value carries color + plain-language context (CTO-readable), per the existing deck rules.
- **Empty/degraded data:** grids like SWIGVA01-AVU221–224 return "query did not return any data" for many sheets — adapters treat those as absent sheets, the families come back provenance-unavailable, and all-N/A sections are suppressed with a caveat note (existing behavior).
- **Capped windows:** `Job List Detailed` / `Jobs` are subject to the 10k row cap; reliability and efficiency figures inherit the existing capped-window caveat.

## Error handling

- Every compute function returns a provenance-marked result even for empty input (available: false); adapters never throw on missing sheets/columns.
- Numeric parsing is defensive: non-numeric cells, Excel serial dates, and "N/A" strings are skipped, never coerced to 0 in weighted denominators.
- Vendor-derived rates (KPI percentages) are never read; only raw sums where no raw rows exist (NetWorker retention buckets, Avamar runtime-summary fallback).

## Testing

- Unit tests per aggregation module on synthetic rows: streak edge cases (single-day failure not flagged, 3-day flagged, no-success-in-window, exception-only days), regression slope on flat / rising / noisy / short series, retention bucket mapping for both products' units, weighted-mean folding, license expiry parsing (text, past, near-future dates).
- Adapter tests with `makeWorkbook` synthetic fixtures per new sheet (never `ref/`).
- `mergeViews`: identity on single source; two-server fold for each new field (weighted metrics, series union, list concat).
- i18n `keyParity` covers all new strings in en/fr/de/it.
- Coverage gate ≥75% on engines applies; CI order typecheck → lint → test:run → build.

## Delivery plan

Four sequential PRs to `main`, each complete (engine + adapters + UI + exports + i18n + tests):

1. `feat/reliability-insights` — reliability.ts + Avamar/NetWorker wiring + sections.
2. `feat/efficiency-retention` — efficiency.ts (dedupe, change rate, retention profile, encryption).
3. `feat/capacity-trend` — capacityTrend.ts + line chart.
4. `feat/config-hygiene` — hygiene.ts + licenses.

No stacking: each PR branches from the then-current `main`.

## Out of scope

- Any projection/forecast beyond observed slope.
- PPDM wiring for the new families (provenance marks them unavailable; `ReliabilityJob` mapping from PPDM activities is a natural follow-up).
- NetWorker ops-insights parity (`50 Longest Backups`, `Savesets Size`, `DBs Backups Analysis`) — worth doing, but it extends the existing `opsInsights` family, not these four; separate iteration.
- Virtualization-footprint reporting (`VCenter List`, `Image Proxy Count`) — deferred.
