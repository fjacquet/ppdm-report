# Deeper deck insights — design

- **Date:** 2026-06-22
- **Status:** Approved (design); implementation pending
- **Branch:** `feat/deck-deeper-insights`

## Problem

The PPTX/HTML deck distills rich Live Optics workbooks down to ~15 top-line numbers — readers call it "too high level." Two kinds of detail are lost: data that is **already computed but dropped** before the slide (`perPolicy[]`, `backupLevelMix`, full `byType`, storage used/free), and data that is **never parsed at all** (per-asset copy times, anomaly-detection sensitivity, dedupe/reduction ratios, per-job duration/policy). Meanwhile the sources carry asset-level and job-level depth across PPDM, NetWorker, and Avamar.

## Readers & goals

One deck serves a **mixed room**: a non-technical **CTO** (leadership/risk) and a **technical owner** (backup admin). Layer the deck — an executive scorecard up front rolling up detailed tracks behind it.

Four insight tracks (all approved, "go comprehensive"):

1. **Exposure & RPO** — biggest unprotected assets (named, sized) + copy-staleness of protected assets.
2. **Cyber-resilience** — immutability / retention-lock, replication (3-2-1), anomaly-detection enablement.
3. **Capacity & efficiency** — Data Domain runway (used/free, flag ≥80%) + dedupe/reduction ratio.
4. **Operational reliability** — failures by policy/type, slowest jobs, per-policy governance.

### Non-goals

- No forecasting/trend lines (Live Optics gives no clean DD time series; runway = current headroom, not a projection).
- No new charting primitive — reuse `DeckBar` / `DeckDonut` / `DeckStack` / `ExportTable`.
- No cross-product totals (the estate model keeps products separate; unchanged).
- No change to the privacy/no-network, SheetJS-pin, or pure-engine invariants.

## Two reader-driven constraints (first-class requirements)

These come directly from the readers and govern every slide.

### C1 — No empty slides

Never render a slide whose content is entirely empty or all "not available." **Section-emit rule:** a section renders only if it has ≥1 available metric / non-empty content. Reconciled with the repo's existing *"provenance, not silent omission"* rule:

- *Within* a partial slide, missing parts still show "not available" notes (provenance preserved).
- If an *entire* section would be all-N/A, **suppress the slide** and fold the unavailability into the consolidated **data-caveats** note — recorded, never silently dropped, never shown as an empty slide.

Precedent already exists (`perServer` renders only with 2+ servers; `idle` only when idle agents exist). Generalize it.

### C2 — Every value carries color + context (the "CTO test")

A non-expert can't judge "62% immutable" or "DD at 87%" without help. Every value ships with:

- **Tone** (`ok` / `warn` / `bad` / `muted`) bound to an explicit threshold.
- A short plain-language **"so what"** caption (`ExportKpi.detail`) and a per-section one-line **takeaway**.
- A **threshold legend** wherever a banded chart appears.

This holds even on compact slides — compactness comes from color + one-liners, not from dropping context.

## Approach

**① Comprehensive layered enhancement** (chosen over enrich-in-place and full narrative restructure). Additive to the proven pipeline: a narrative exec scorecard, enrichment of truncated slides, merge of overlapping slides, and new per-track detail — each metric computed per-product where the source supports it, suppressed (C1) otherwise.

## Target deck structure (before → after)

| Current | Proposed |
|---|---|
| Title | unchanged |
| Exec summary (4 KPIs + posture bar) | **ENHANCED** — add a 4-chip **readiness strip** (Exposure · Cyber · Capacity · Reliability), each tone-coded with a plain headline; N/A tracks render muted. Always present. |
| Coverage (pie + top-6 bars) | **ENRICHED** — surface the full `byType` table (computed today, truncated to 6). |
| Gaps (unprotected list) | **EVOLVED → "Recovery exposure & RPO"** (`SectionId: exposure`) — biggest unprotected (sized) + copy-staleness distribution + oldest-protected-copy table. |
| Compliance (3 KPIs) | **MERGED into Cyber-resilience.** |
| _(new)_ | **NEW "Cyber-resilience posture"** (`SectionId: resilience`) — immutable/retention-lock %, replication/3-2-1 %, anomaly-detection enablement %, app-consistent %, per-policy resilience table. |
| Jobs (success % + status bars) | **ENRICHED** — failures-by-policy/type + slowest/longest jobs. |
| Capacity (top-6 util bars) | **ENRICHED → "Capacity & efficiency"** — used/free runway (flag ≥80%) + dedupe/reduction ratio. |
| Policies (purpose tally) | **ENRICHED** — per-policy governance table (`perPolicy[]` + retention/schedule/last-status). |
| Per-server (if 2+) | unchanged |
| Idle agents | unchanged |

**Net change: 0 new sections** — Compliance is absorbed into Cyber-resilience and Gaps evolves into Exposure; both are renames/upgrades, not additions. The deck gets *richer, not longer*. (Richer sections may use more slide area; `slidePlan` pairing handles layout — e.g. a long per-policy table can claim a full-width slide like `idle` does.)

`SectionId` becomes: `perServer · coverage · exposure · resilience · jobs · capacity · policies · idle` (was `… gaps … compliance …`). Both `assessment` and `ops` orders in `sectionOrder.ts` updated.

## Per-slide content + data-availability (suppression) matrix

Products: **PPDM-detail** (e.g. WHO), **PPDM-summary** (CHUV/Sarah Bush), **NetWorker**, **Avamar**.

### Exec scorecard (enhanced)
- **Shows:** existing 4 KPIs + posture bar + 4-chip readiness strip (tone + plain headline).
- **Availability:** always present (coverage + job-success always computable); N/A tracks → muted chips. Never empty.

### Coverage (enriched)
- **Shows:** pie/donut/top-6 bars + full `byType` table.
- **Source:** `AGENT_SHEETS` Protection Status (already parsed).
- **Availability:** detail → full table; summary → overall donut only (table suppressed, donut remains).

### Recovery exposure & RPO (`exposure`, evolved from `gaps`)
- **Shows:** biggest unprotected (named, sized) · copy-staleness distribution (≤1d / ≤7d / ≤30d / >30d / never) · oldest-protected-copy table.
- **Source:** `Unprotected Assets` (size) · per-asset `Last Available Copy Time` vs `meta.capturedAt`.
- **Availability:** PPDM-detail full ✅ · NetWorker unprotected clients (size unknown) + client-level last-backup age ⚠️ · Avamar `Clients No Backups` + `…7 Days` coarse ⚠️ · **PPDM-summary → SUPPRESS** (no list, no copy times) · **also SUPPRESS staleness when `meta.capturedAt === ''`** (no anchor).

### Cyber-resilience (`resilience`, new — absorbs Compliance)
- **Shows:** immutability/retention-lock % · replication / 3-2-1 % · anomaly-detection enablement % · app-consistent % · per-policy resilience table (lock?, replicated?, retention).
- **Source:** `Policy Stages` (Retention Lock, REPLICATION stage) + `Copies` (Lock/Replica) + per-asset `Anomaly Detection Sensitivity`; NetWorker `Devices Detailed` DD Retention Lock Mode + `Backups` Clone Status.
- **Availability:** PPDM-detail full ✅ · PPDM-summary immutable+replication ✅ / anomaly N/A · NetWorker immutable+replicated ✅ / anomaly N/A · **Avamar → SUPPRESS** (no immutability/replication/anomaly in export).

### Jobs (enriched)
- **Shows:** success % + status bars + failures-by-policy/type + slowest/longest jobs table.
- **Source:** PPDM `Protection Job Activities` (policy, type, result, run duration, throughput) · NetWorker `Jobs` + `50 Longest Backups` · Avamar `Group Summary` + `Top50 Longest`.
- **Availability:** all products ✅ (granularity varies; NetWorker failures grouped by client) → never empty.

### Capacity & efficiency (enriched)
- **Shows:** per-target used/free stacked bars + util% (flag ≥80%) + dedupe/reduction ratio + logical-vs-physical.
- **Source:** `Storage Targets` used/total + `Job Activities` dedupe (PPDM) · `Data Domains` + `Dedup Jobs` (NetWorker) · `Node Utilization` + `% Common` (Avamar; util-only, reduction ✅).
- **Availability:** runway present wherever any target exists; reduction suppressed where no dedupe data. Avamar runway partial (util% only, no used/free totals).

### Policies (enriched)
- **Shows:** purpose tally + per-policy governance table (name, asset count, capacity, retention, schedule, last status).
- **Source:** PPDM `Policies` + `Policy Stages` · NetWorker `Policies` (workflow schedule/retention) · Avamar `Group Summary` (group-level).
- **Availability:** PPDM/NetWorker full ✅ · Avamar group-level ⚠️. Policy count always present → never empty.

**Suppression summary:** `exposure` drops on PPDM-summary (and when no capture date); `resilience` drops on Avamar. All suppressions are recorded in the caveats note (C1).

## Context & color layer (C2 mechanics)

A single pure module **`src/engines/export/thresholds.ts`** is the only place tone bands + context strings live (DRY, unit-tested). Proposed defaults (tunable; posture bands to be validated against Dell/industry guidance during planning):

| Metric | 🟢 ok | 🟡 warn | 🔴 bad |
|---|---|---|---|
| Coverage % | ≥ 95 | 80–95 | < 80 |
| Job success % | ≥ 98 | 90–98 | < 90 |
| Immutable / retention-lock % | ≥ 80 | 30–80 | < 30 |
| Replicated (3-2-1) % | ≥ 80 | 50–80 | < 50 |
| Anomaly-detection enablement % | ≥ 50 | 1–50 | 0 |
| DD utilization % | < 70 | 70–85 | ≥ 85 |
| Copy staleness | ≤ 7d | ≤ 30d | > 30d / never |
| Reduction ratio | context only — e.g. "12.4× — every 1 TB stored protects 12 TB" |

Each section carries a generated plain-language **takeaway** line (e.g. *"1 of 2 Data Domains is nearly full — plan capacity now"*).

## Architecture & data flow

Pipeline and pure-engine invariants unchanged:

```
source sheets → product adapter reads NEW columns → new pure aggregation modules
  → ReportView (new sub-structures + provenance) → mergeViews (single-server = identity)
  → buildExportModel (thresholds→tone, readiness rollup, section-emit/suppress, takeaways)
  → ExportModel → buildPptx / HTML  (reuse Deck* + ExportTable, Arial)
```

- **New pure aggregation modules** (`src/engines/aggregation/`): `rpo.ts`, `resilience.ts`, `efficiency.ts`, `reliability.ts`. **Extend:** `capacity.ts` (used/total/free on `StorageTarget`), `policies.ts` (retention/schedule/last-status on `PolicyRow`). `coverage.ts` already computes full `byType`. Each returns data **+ `MetricProvenance`**.
- **`thresholds.ts`** — tone + context single source of truth.
- **No `Date.now()`** — staleness uses `meta.capturedAt`; when `''`, RPO is unavailable (suppress per C1). Job-derived metrics inherit the `LIVE_OPTICS_ROW_CAP` (10,000) caveat.
- **Product adapters** (`buildPpdmView` / `buildAvamarView` / `buildNetworkerView`) wire each aggregation only where the source supports it, driving the `available` flag.
- **Suppression** lives in `buildExportModel` (already emits conditional sections); `slidePlan` consumes whatever survives.

### Type changes (`src/types/reportView.ts` + export types)

- Extend `MetricKey`: add `'rpoStaleness' | 'anomalyDetection' | 'efficiency' | 'reliability' | 'policyDetail'` (immutable/replicated stay under existing `'compliance'`). Update `provenance.ts` factory helpers (`allAvailable` / `allUnavailable` / `avamarProvenance` / `networkerProvenance`) for the new keys.
- Extend `StorageTarget` with `usedGb? / totalGb? / freeGb?` (optional — Avamar has none).
- Extend `PolicyRow` with `retention? / schedule? / lastStatus? / retentionLock? / replicated?`.
- New `ReportView` sub-structures: `rpo` (staleness bands + oldest list), `resilience` (immutablePct/replicatedPct/anomalyPct + per-policy), `efficiency` (reduction ratio + logical/physical), `reliability` (failures-by-policy/type + slowest list). Each optional/availability-flagged.
- `ExportModel` gains the readiness-strip structure; `buildExportModel` serializes `perPolicy`, `backupLevelMix`, full `byType` (dropped today).
- `SectionId` rename `gaps→exposure`, `compliance→resilience`; update `SECTION_ORDER` (both flavors) and `slidePlan`.

## Testing & i18n

- Unit test per new/extended module with synthetic `makeWorkbook` fixtures across **all four shapes** (PPDM-detail, PPDM-summary, NetWorker, Avamar) — assert metrics, provenance `available` true/false, **and suppression**.
- `thresholds.ts` boundary tests (band edges).
- `buildExportModel` tests: section present-vs-suppressed per fixture; readiness chip tones; takeaway keys resolve.
- `keyParity.test.ts` enforces all new strings across **en / fr / de / it**.
- Engine coverage stays **≥ 75%**; CI order (typecheck → lint → test:run → build) must pass.
- Never read gitignored `ref/` fixtures (CI ENOENT) — synthetic workbooks only.

## Phasing (each phase = own slice/PR, shippable)

- **P0 — quick wins + context layer** (no new parsing): `thresholds.ts`; tone + takeaways on existing KPIs; serialize `perPolicy` governance table, `backupLevelMix`, full `byType`; storage used/free. *Immediate visible lift.*
- **P1 — Exposure & RPO:** `rpo.ts`, evolve `gaps → exposure` slide.
- **P2 — Cyber-resilience:** `resilience.ts`, merge Compliance → `resilience` slide.
- **P3 — Capacity & efficiency:** `efficiency.ts`, runway enrich.
- **P4 — Operational reliability:** `reliability.ts`, enrich Jobs + Policies.
- **P5 — Exec readiness strip:** roll up P1–P4 provenance into the scorecard chips.

## Risks / open questions

- **Threshold defaults** are heuristics — validate posture bands (immutable/replicated/anomaly) against Dell/industry guidance before P2/P5.
- **NetWorker/Avamar RPO** is client-level (coarser than PPDM asset-level); acceptable, labelled as such — not faked to asset granularity.
- **Per-asset parsing cost** — reading 50-column asset sheets across types adds work in the adapters; keep it lazy/streamed within existing parse, no new worker round-trips.
- **`SectionId` rename** touches i18n keys, `sectionOrder`, `slidePlan`, and tests — contained, but landed in P0 to avoid churn later.
