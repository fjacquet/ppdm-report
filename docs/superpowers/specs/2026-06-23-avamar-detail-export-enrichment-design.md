# Avamar detail-export enrichment — design

- **Date:** 2026-06-23
- **Status:** Approved (design); implementation pending
- **Branch:** `feat/avamar-detail-enrichment` (proposed)

## Problem

The Avamar adapter (`buildAvamarView`) was built against a **summary-style** Live Optics export
(pre-aggregated count + summary sheets). A real-world export (`TEST avamar.xlsx`, 32 sheets) is
**detail-style**: it carries per-job and per-client rows, and three of the summary sheets the adapter
depends on come back **empty** (the collector's query returned no data):

| Sheet the adapter reads | State in the detail export | Resulting metric today |
|---|---|---|
| `Backup Completion Summary` | header present, row all-null | **Jobs → 0 jobs, 0% success** ❌ |
| `Backup Plugins` | "The query executed did not return any data." | **Workload types → empty** ❌ |
| `Group Summary` | "The query executed did not return any data." | **Policies → 0** ❌ |
| `NonRetired/Retired Clients With Backups`, `Clients No Backups`, `Node Utilization`, `Disabled Groups` | populated | Coverage / gaps / capacity / idle ✓ |

So the deck for a detail export is half-empty: coverage, gaps and capacity render, but **jobs,
workload types and policies are zero/empty**, and compliance + front-end volumetry are N/A — while the
detail sheets that *could* drive far richer, accurate metrics sit unused (`Job List Detailed` 30,096
rows, `Avamar DPN Summary` 30,040 rows, `Client Capacity` 319 rows, `Replication (Completion Status)`,
`Client Version Count`, `Overtime Clients`, `Top50 Longest Backups`).

## Goal

Make the **single** `buildAvamarView` derive metrics from the **detail sheets when present, falling
back to the summary sheets when not** — restoring the broken metrics, enriching with front-end
volumetry + replication resilience, and adding three new ops-insight sections. No global
detail-vs-summary fork (the export is not a clean dichotomy — it mixes populated count sheets with
empty summary sheets), no new parse schema, no store/privacy/SheetJS-pin changes.

### Non-goals

- **No global `detectFormat` fork for Avamar.** Per-metric graceful fallback only.
- **No fabricated coverage-by-type** (see D-COV). Avamar type totals don't reconcile to a per-type
  protected/unprotected split; we will not invent one.
- **No new parse schema / Zod boundary changes.** Read existing sheets only.
- **No new charting primitive.** Reuse `ExportTable` + the existing `drawTableSlide` path.
- **No back-end / sized-capacity modelling.** Front-end peak GiB is reported as-is (a sizing input).
- No store, React, or privacy / no-network / SheetJS-pin invariant changes.

## Approved decisions

| # | Decision | Choice |
|---|---|---|
| D-SCOPE | How far | **Fix + enrich + ops insights** (broken metrics restored, front-end + replication added, three new ops slides). |
| D-OPS | New-surface ops insights | **All three**: agent-version spread, at-risk clients, longest backups. |
| D-COV | Coverage-by-type | **Keep unavailable** — `coverage.byType` stays empty + provenance "not available" (honors the no-fake-numbers invariant). Optional small **client-type composition** note (REGULAR / VMACHINE / VREGULAR counts) for context, with no protected/unprotected split. |
| D-FALLBACK | Detail vs summary | **Per-metric**: prefer the detail sheet; fall back to the summary sheet when the detail sheet is absent/empty. |
| D-CAP | Row cap | **Force `capped: false` for Avamar** job/compliance metrics — the 10k flag is a PPDM convention; Avamar exports more than 10k rows uncapped (30,096 ≠ a round cap), so `readWorkbook`'s `capped: dataRows.length >= 10_000` is a false positive here. |

## 1. Per-metric data mapping (source → target)

All capacity is **base-2 GiB** (`Details` disclaimer: *"Avamar Data is calculated using Base 2"* →
existing `meta.baseTen: false`); numbers store raw and format per `meta.baseTen`.

### 1.1 Jobs — `src/engines/products/avamar/jobs.ts` (new, pure)

- **Primary:** `Avamar DPN Summary`, restricted to backup operations (`Operation` ∈
  {`On-Demand Backup`, `Scheduled Backup`}; exclude `Restore`). Map `Status` to the existing
  Avamar-native buckets:
  - `SUCCESS` = `Activity completed successfully.`
  - `EXCEPTION` = `Activity completed with exceptions.`
  - `FAILED` = everything else (`… failed …`, `… cancelled.`, `Dropped Session …`,
    `… timed out …`).
  - `successPct = SUCCESS / total` (excludes exception + failed, matching current Avamar semantics);
    `counts = { SUCCESS, EXCEPTION, FAILED }`; `total` = backup rows; **`capped: false`** (D-CAP);
    `windowSize = total`.
- **Fallback:** when `Backup Completion Summary` row[0] has a finite numeric `Total > 0`, use the
  existing summary-sheet path unchanged.
- Sample (this file): SUCCESS 29,522 / EXCEPTION 146 / FAILED ~372 → **~98.3%**.

### 1.2 Workload types in use — `src/engines/products/avamar/workloads.ts` (new, pure)

- **Primary:** distinct `Policy Type` from `Job List Detailed` where `Job Type = Backup`, **excluding
  `GC`** (garbage collection, a maintenance job, not a workload). `No Plug-in` is **excluded** from the
  in-use workload list (not a meaningful workload type for a CTO reader) — flagged as a review point.
- **Fallback:** `Backup Plugins` `Plugin Name` where `Count > 0` (existing path).
- Produces the `inUse: string[]` list (e.g. `Windows VMware Image`, `Windows File System`,
  `Linux File System`, `Windows SQL`, `Windows VSS`, `Windows Exchange VSS`, `Linux VMware Image`).
- **Naming consistency:** the same type labels feed front-end volumetry (§1.4), which reads
  `Client Capacity.Application` — confirmed to use the identical label set.

### 1.3 Policies — `src/engines/products/avamar/policies.ts` (new, pure)

- **Primary:** distinct non-empty `Group Name` from `Job List Detailed`. `policies.count` = distinct
  group count. `perPolicy` rows: `{ name: groupName, purpose: '', assetCount: distinct Host count,
  protectionCapacityGb: Σ Capacity (GiB) }`. `byPurpose = {}` (Avamar groups carry no purpose field).
- **Fallback:** `Group Summary` `Group Name` (existing path).

### 1.4 Front-end volumetry — `computeAvamarFrontEnd` in `src/engines/aggregation/frontEnd.ts`

- **Source:** `Client Capacity` — group by `Application`, `protectedDiscoveredGb = Σ Max Peak GiB`.
  These clients have backups → the value is **protected discovered/peak** front-end. The other three
  `FrontEndTypeRow` fields (`protectedFetbGb`, `unprotectedDiscoveredGb`, `unprotectedFetbGb`) are
  `undefined` (render `–`). `excludedCount = 0`.
- Sample: ~53 TiB across 8 `Application` types. Reuses the existing `FrontEnd`/`FrontEndTypeRow`
  type and the existing volumetry export section + slide (no new surface).
- Distinct from PPDM's `computeFrontEnd` (per-asset `Protection Status` sheets); a separate Avamar
  function keeps each isolated and pure.

### 1.5 Replication resilience — `src/engines/products/avamar/replication.ts` (new, pure)

- **Source:** `Replication (Completion Status)` (`Status` → `Total`). `replicatedCount` = the
  `Activity completed successfully.` total; `windowSize` = Σ all rows; `replicatedPct =
  replicatedCount / windowSize`. `appConsistentCount = 0`, `immutableCount = 0`, `backupLevelMix = {}`,
  `capped: false`.
- Maps to `compliance.replicatedPct`. **App-consistency and immutability stay N/A → render 0%** — the
  established **NetWorker precedent** (compliance marked available with app-consistency N/A). The
  resilience section labels/caption make clear only replication is measured for Avamar.
- Sample: 80,191 / 80,433 → **99.7%**.

### 1.6 Coverage / gaps / capacity / idle — unchanged

Coverage (`NonRetired/Retired Clients With Backups`), gaps (`Clients No Backups`, no per-asset size),
capacity (`Node Utilization`, base-2 grid node util), idle (`Disabled Groups`) keep their current
logic. `coverage.byType` stays **empty** (D-COV).

### 1.7 Optional client-type composition note (D-COV)

`Clients Types All` (`REGULAR` / `VMACHINE` / `VREGULAR` totals, excluding `ALL CLIENT TYPES`) may be
surfaced as a small **informational** breakdown (counts only, no protected/unprotected split) attached
to the coverage section caption. Low priority; additive; never presented as a coverage band.

## 2. New ops-insight data model (`src/types/reportView.ts`)

One grouped, required field — mirrors how `frontEnd` is modelled (always present, empty default,
empty-section suppression hides it for products that don't populate it).

```ts
export interface AgentVersionRow {
  version: string   // e.g. "19.4.100-116", or "Unknown"
  count: number
}

export interface AtRiskClient {
  name: string
  clientType?: string
}

export interface AtRiskClients {
  /** Clients breaching their backup window (`Overtime Clients`). */
  overtime: TopList<AtRiskClient>
  /** Clients with no backup in 7 days (`Clients No Backups 7 Days`). */
  staleBackups: TopList<AtRiskClient>
}

export interface LongBackupRow {
  server: string
  policyType: string
  durationHr: number
  capacityGb?: number
  throughputMbSec?: number
}

export interface OpsInsights {
  agentVersions: AgentVersionRow[]
  atRisk: AtRiskClients
  longestBackups: TopList<LongBackupRow>
}

// Added to ReportView:
//   opsInsights: OpsInsights
```

- `emptyOpsInsights()` → all lists empty, both `TopList`s `{ items: [], total: 0, shown: 0 }`.
- These are **conceptually cross-product** (PPDM/NetWorker have agent versions, SLA risk, and job
  durations too) — only Avamar populates them initially; the field is generic, not Avamar-tagged.
- `opsInsights` does **not** add a `MetricKey`/provenance entry — an empty list already signals
  absence, and each sub-section is suppressed when empty.

## 3. Ops-insight engines (`src/engines/products/avamar/opsInsights.ts`, new, pure)

`computeAvamarOpsInsights(wb: RawWorkbook): OpsInsights`

- **Agent versions:** `Client Version Count` (`Agent Version` → `Total`), sorted by count desc;
  `Unknown`/low versions flagged at render via `thresholds.ts`. Fallback to aggregating
  `Client Version` per-client when the count sheet is absent.
- **At-risk:** `overtime` from `Overtime Clients` (`Full Domain Name`, `Client Type`); `staleBackups`
  from `Clients No Backups 7 Days` (`Display Full Domain`). Each capped to `TOP_N_DEFAULT` via the
  existing `topN` helper; `total` = full row count. **Distinct** from never-protected gaps.
- **Longest backups:** `Top50 Longest Backups` (`Server`, `Policy Type`, `Duration Hr`,
  `Capacity GiB`, `Throughput MB/sec`), sorted by duration desc, capped to a deck-appropriate top-N.

## 4. Provenance changes (`src/engines/aggregation/provenance.ts`)

`avamarProvenance()` updates:

| MetricKey | Before | After |
|---|---|---|
| `coverageByType` | unavailable | **unavailable** (unchanged — D-COV) |
| `compliance` | unavailable | **available** (replication measured; assetsCovered/Total = replication window) |
| `frontEnd` | unavailable | **available** |
| `gapsList`, `storageTargets` | available | available (unchanged) |

## 5. Merge layer (`src/engines/aggregation/mergeViews.ts` + `frontEnd.ts`)

- `frontEnd`: already folded by `mergeFrontEnd` (union types, sum defined fields) — Avamar's
  `protectedDiscoveredGb` rows fold correctly; identity on single server.
- **New `mergeOpsInsights(opsInsights: OpsInsights[]): OpsInsights`** (in
  `src/engines/aggregation/opsInsights.ts`, alongside `emptyOpsInsights`):
  - `agentVersions`: merge by `version`, summing `count`.
  - `atRisk.overtime` / `atRisk.staleBackups`: concat `items`, re-cap to `TOP_N_DEFAULT`, sum `total`.
  - `longestBackups`: concat `items`, re-sort by `durationHr` desc, re-cap, sum `total`.
  - **Single-server input is an identity** (one view → its `opsInsights` unchanged) — covered by a test.
- `mergeViews` wires `opsInsights: mergeOpsInsights(views.map(v => v.opsInsights))` and the existing
  `inUse`/`idleAgents` Set-merge already handles Avamar's non-`AGENT_SHEETS` names.

## 6. Export model & rendering

Mirror the front-end-volumetry surface pattern exactly (table-first, full-width in-place slides,
caveats in `table.caption`).

- **`buildExportModel.ts`:** three new `ExportSection`s — `agentVersions`, `atRisk`, `longestBackups`
  — each table-first (`table.columns`/`table.rows`, base-2 sizes via the existing GiB-aware
  formatter), built only when their list/total is non-empty.
- **`sectionOrder.ts`:** add the three `SectionId`s; place ops-insight sections **late in `assessment`,
  earlier/emphasised in `ops`** (the existing two-flavor emphasis mechanism — no engine fork).
- **PPTX (`pptx/slidePlan.ts`):** special-case each new section to an in-place `{ kind: 'table' }`
  slide and exclude from the trailing appendix-table dedup (same change shape as `volumetry`).
- **HTML:** `assembleHtml` already renders `table` + `caption`; no new HTML code.
- **Dashboard UI:** new section components under the Avamar `ProductSection`, following the existing
  table-section components; rendered from the same `ExportModel`/`ReportView`.
- **`thresholds.ts`:** tone rules — at-risk counts > 0 → warning; `Unknown`/old agent versions →
  warning; backup duration over a threshold → warning. Every value gets color + plain-language context
  (CTO-reader rule).
- **Empty-section suppression:** each new section emits nothing renderable when its source list is
  empty, so PPDM/NetWorker (empty `opsInsights`) and Avamar exports lacking a given sheet never
  produce an empty slide — the unavailability folds into data-caveats instead.

## 7. Invariants honored

- `engines/` stay pure (no React/DOM/store/`Date.now`); store holds inputs only; one derivation point
  (`useReportView` → `buildEstateDocument`).
- Privacy / no-network, SheetJS pin (`xlsx` CDN tarball), telemetry denylist, service-worker allowlist
  — untouched; supply-chain gate stays green.
- **`capped: false`** forced for Avamar job/compliance (D-CAP) so complete 30k-row data is never
  mislabelled a window.
- **i18n parity**: all new `dashboard:*` keys (section titles, column headers, footnotes, threshold
  captions) added to **all four** locales (en/fr/de/it); `keyParity.test.ts` enforces it.
- Base-2 byte formatting via `meta.baseTen: false` (Avamar convention) through `utils/format`.
- Single ECharts import (no new chart primitive); deck-quality rules (no empty slides, values get
  context).

## 8. Build phasing (each phase ships green: typecheck → lint → test:run → build)

1. **Engine fixes + enrich** — §1 (jobs/workloads/policies fallback, front-end, replication) +
   provenance (§4) + tests. Restores existing slides; populates existing `frontEnd`/`compliance`. No
   new types, no new surface.
2. **Engine ops-insights** — §2 `OpsInsights` type, §3 compute fns, §5 merge, `ReportView` wiring,
   `emptyOpsInsights` defaults for PPDM/NetWorker/summary builders + tests.
3. **Surface** — §6 ExportModel + PPTX + HTML + dashboard components + i18n×4 + `thresholds.ts` tone +
   suppression + slide-plan tests.

## 9. Tests (synthetic `makeWorkbook` fixtures only — never read `ref/`)

- **Jobs:** detail-derivation from `Avamar DPN Summary` (SUCCESS/EXCEPTION/FAILED mapping, restore
  excluded, `capped: false` even with ≥10k rows); summary-sheet fallback when
  `Backup Completion Summary` populated.
- **Workloads:** distinct `Policy Type` (GC + No-Plug-in excluded); `Backup Plugins` fallback.
- **Policies:** distinct `Group Name` + per-group capacity; `Group Summary` fallback.
- **Front-end:** `Client Capacity` → per-`Application` `protectedDiscoveredGb`, other fields
  `undefined`.
- **Replication:** `Replication (Completion Status)` → `replicatedPct`; app-consist/immutable 0.
- **Ops insights:** each `compute*`; `mergeOpsInsights` single-server identity + multi-server fold.
- **Provenance:** Avamar `compliance`/`frontEnd` available, `coverageByType` unavailable.
- **Coverage:** `coverage.byType` stays empty.
- i18n key-parity (automatic). Coverage stays ≥75% on engines/utils.

## 10. Files touched

| File | Change |
|---|---|
| `src/types/reportView.ts` | + `AgentVersionRow`, `AtRiskClient`, `AtRiskClients`, `LongBackupRow`, `OpsInsights`, `ReportView.opsInsights` |
| `src/engines/products/avamar/buildAvamarView.ts` | wire detail-first metrics + fallbacks + `opsInsights` |
| `src/engines/products/avamar/jobs.ts` | **new** — DPN-Summary jobs + summary fallback |
| `src/engines/products/avamar/workloads.ts` | **new** — Policy-Type workloads + plugin fallback |
| `src/engines/products/avamar/policies.ts` | **new** — Group-Name policies + summary fallback |
| `src/engines/products/avamar/replication.ts` | **new** — replication resilience |
| `src/engines/products/avamar/opsInsights.ts` | **new** — agent versions / at-risk / longest backups |
| `src/engines/aggregation/frontEnd.ts` | + `computeAvamarFrontEnd` |
| `src/engines/aggregation/opsInsights.ts` | **new** — `emptyOpsInsights` + `mergeOpsInsights` |
| `src/engines/aggregation/provenance.ts` | `avamarProvenance`: compliance + frontEnd available |
| `src/engines/aggregation/mergeViews.ts` | fold `opsInsights` |
| `src/engines/products/{ppdm,networker}/*`, `summaryView.ts` | set `opsInsights: emptyOpsInsights()` |
| `src/engines/export/sectionOrder.ts` | + three `SectionId`s + flavor placement |
| `src/engines/export/buildExportModel.ts` | + three ops-insight sections |
| `src/engines/export/pptx/slidePlan.ts` | special-case the three sections → in-place table slides |
| `src/engines/export/thresholds.ts` | tone rules for at-risk / agent versions / duration |
| dashboard section components (Avamar `ProductSection`) | + three table sections |
| `src/i18n/locales/{en,fr,de,it}/dashboard.json` | + ops-insight keys |
| `*.test.ts` | new + updated tests above |

## 11. Risks

- **Status-string drift** across Avamar/collector versions (`Avamar DPN Summary.Status`,
  `Replication.Status`) — mitigated by mapping known SUCCESS/EXCEPTION strings and bucketing the rest
  as FAILED (fail-safe direction); new known strings are a one-line list addition.
- **`No Plug-in` / `GC` exclusion** from workloads is a judgment call — validate against more exports.
- **Fallback detection** (`Backup Completion Summary` "populated") must treat an all-null row and the
  "query returned no data" sentinel as empty — covered by a test.
- **`planSlides` special-cases** are the only non-additive touches — covered by slide-plan unit tests
  asserting each section appears once, in place, not duplicated in the appendix.
- **Privacy:** the analysis copied the customer workbook into a session scratchpad to inspect
  structure; the copy was deleted. Tests use synthetic fixtures only.
