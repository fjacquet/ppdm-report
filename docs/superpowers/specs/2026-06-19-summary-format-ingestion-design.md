# Summary-Format (Older PPDM) Ingestion — Design

**Date:** 2026-06-19
**Status:** Approved (design); pending implementation plan
**Topic:** Ingest older Live Optics PPDM `.xlsx` exports — which carry **pre-aggregated summary** sheets instead of per-asset detail rows — and merge them into the estate alongside current ("detail") exports.

## Problem

The multi-server feature (ADR 0009) assumes every `.xlsx` is the current **detail** format: one row per asset / copy / job, from which the six aggregation engines compute counts, capacities, coverage, and compliance. Three real customer files (`ref/chuv-a1n01136i.xlsx`, `ref/chuv-a1n01178i.xlsx`, `ref/CHUV-a1n01242i.xlsx`, collector build `25.3.2.1`, PPDM `19.18`) use an **older summary** schema: different sheet names, and the data is already rolled up (`VM Asset Count: 1758`, `Number of Protected Assets: 1782`) with **no per-asset / per-copy rows at all**.

The current pipeline merges servers by **row-union at the sheet level** (`buildReportView(mergeWorkbooks(servers))`). Summary files have no rows to union, so they cannot enter the estate today. We want them to — merging at the metrics level — while being honest about the metrics the older format genuinely cannot supply.

### The two formats (verified against the files)

**Detail (current, e.g. `ref/PPDM.xlsx`)** — per-asset sheets: `Virtual Machines`, `SQL Databases`, `File Systems`, `Copies` (≤10k), `Unprotected Assets`, `Protection Job Activities`, `Storage Targets` (with `Utilization (%)`), `Data Domain Mtrees`, `Policies`.

**Summary (older, the `chuv-*` files)** — pre-aggregated sheets: `Details`, `System Information`, `System Configuration`, `Assets Capacity General`, per-type `… Count And Cap` / `… Assets & Cap`, `Policy Statistics`, `Jobs Summary`, `Policies`, `Policy Stages`, `Storage Targets` (**no** `Utilization (%)` / total size), `Data Domain Mtrees`, `VCenters`, `CDR`. No `Copies`, no per-asset rows, no `Unprotected Assets` list.

## Goals

- Accept summary-format exports through the same upload path; load them standalone **and** mixed with detail-format servers in one estate.
- Reuse the existing `ReportView` shape and dashboard/export renderers — summary files feed the **same** view model.
- Be explicit, never misleading: metrics the summary format cannot supply are marked **unavailable** (never a silent `0`), and metrics only some servers can supply carry a **coverage note** ("covers N of M servers / X of Y assets").
- Keep detail-format estate output **numerically identical** to today (test-gated parity).

## Non-Goals (YAGNI)

- No per-type **capacity** coverage widget for summary files in base scope (see Decision 4 — deferred, not rejected).
- No reconstruction of per-asset or per-copy data that the summary format does not contain (unprotected-asset list, copy immutability/replication/consistency, storage utilization). These stay unavailable.
- No trend/time-series across snapshots; no live PPDM API (ADR 0001/0002 unchanged).
- No new export *renderers* — provenance flows through the existing deck-driven model.

## Decisions (from brainstorming)

1. **Scope:** Full **estate integration** — summary files merge alongside detail files (and each other) at the **metrics** level.
2. **Architecture:** **Approach B** — format-aware `buildReportView`, and the merge moves **up** from sheet-level to view-level (`mergeViews`). One `ReportView` shape, one merge concept, no fabricated data. (Approach A — synthetic rows — rejected for fabricating data and being unable to honor coverage notes; Approach C — dual-source engines — rejected for spreading format-awareness across all six engines.)
3. **Partial metrics:** In a mixed estate, detail-only metrics are **shown with a coverage note**, computed from the servers that have the data — not blanked, not shown raw.
4. **Per-type coverage:** Summary files give per-type *capacity* splits and total counts, but **not** per-type protected/unprotected *counts*. Per-type coverage (`coverage.byType`, a count-band) is therefore scoped **unavailable** for summary servers, with a note. A per-type *capacity* coverage view is a possible future enhancement, out of base scope.

## Architecture

### The seam moves up

Today: `combined = buildReportView(mergeWorkbooks(servers))` — merge happens **below** the view, at sheet/row level. Summary files break this because they have no rows.

New: each server is turned into a `ReportView` **first** (format-aware), then the per-server views are merged:

- **Per-server view** = `buildReportView(workbook)` — dispatches on format.
- **Combined view** = `mergeViews(perServerViews)` — combines metrics, not rows.

`mergeViews` is the only genuinely new combination logic. The six detail engines are **untouched**. The well-tested estate **warning** logic is preserved verbatim (extracted, not rewritten). Row-level `mergeWorkbooks` is retired.

### Format detection — `detectFormat(wb: ParsedWorkbook): 'detail' | 'summary'`

Sheet-signature, no version string needed:
- **summary** if `System Configuration` present **and** any `… Count And Cap` / `… Assets & Cap` sheet present.
- **detail** otherwise (per-asset sheets such as `Copies` / `Virtual Machines`).

Pure helper in `engines/parser/`. Used by `buildReportView` and (for the mixed-estate umbrella warning) by the derivation layer.

### Metadata tolerances (both confirmed in the files)

- **Date:** summary `Details > Date` is a preformatted string `"18/02/2025 03:54:24"`, not an Excel serial. `captureMeta` parses `DD/MM/YYYY HH:mm:ss` → ISO when it sees a string; keeps `serialToIso` for numbers; `''` when unparseable.
- **Version:** summary `System Information` has `Power Protect Version = N/A` but `Product Version = 19.18.0-14`. `appVersion` gains a fallback chain: `PowerProtect Version → Power Protect Version → Product Version`. Host Name key (`Host Name`) is unchanged, so `deriveLabel` works as-is.

### Summary extractor — `summaryView(wb: ParsedWorkbook): ReportView`

New module `engines/aggregation/summaryView.ts`. Reads the pre-aggregated sheets into the **same `ReportView`** the dashboard consumes. Field-by-field source and availability:

| `ReportView` field | Summary-format source | Status |
|---|---|---|
| `meta` | `Details` (string-date tolerant) | ✅ |
| `coverage.overall` (counts) | `System Configuration`: `Number of Protected Assets` / `Number of UnProtected Assets`; `excluded = max(0, Assets Count − protected − unprotected)` | ✅ |
| `coverage.byType` (count bands) | not derivable (per-type capacity only, not count-by-status) | ⚠️ unavailable |
| `gaps.count` | `System Configuration > Number of UnProtected Assets` | ✅ |
| `gaps.totalCapacityGb` | Σ per-type `… Capacity Unprotected Assets (GB)` | ✅ |
| `gaps.top` (asset list) | no per-asset rows | ⚠️ unavailable |
| `jobs` (counts, successPct) | `Jobs Summary` (per-type Successful/Failed/Cancelled/Ok-with-Errors/Unknown/Skipped; `N/A`→0); complete, **not** a 10k window (`capped: false`) | ✅ |
| `compliance` | no `Copies` sheet | ⚠️ unavailable |
| `capacity.mtreeCount` | `Data Domain Mtrees` row count | ✅ |
| `capacity.targets` / `flagged` | `Storage Targets` lacks `Utilization (%)` / total size | ⚠️ unavailable |
| `policies` | `Policies` (Name, `Number of Assets`, `Total Asset Protection Capacity (GB)`; `purpose ← Category`) | ✅ |
| `inUse` / `idleAgents` | per-type `… Asset Count > 0`, mapped to canonical `AGENT_SHEETS` labels (VM→`Virtual Machines`, FS→`File Systems`, SQL→`SQL Databases`, Oracle→`Oracle Databases`, Exchange→`Microsoft Exchange Databases`, SAP HANA→`SAP HANA Databases`, NAS→`NAS`, Kubernetes→`Kubernetes`) | ✅ |

Unavailable fields are populated with their neutral empty value (`compliance` zeros / `windowSize: 0`; `gaps.top` empty with `total = count`; `capacity.targets: []`) **and** flagged via provenance (below) so renderers show an explicit "not available" state rather than a misleading zero.

### Provenance model (additive — numeric fields untouched)

```ts
// types/reportView.ts
export type MetricKey = 'coverageByType' | 'gapsList' | 'compliance' | 'storageTargets'

export interface MetricProvenance {
  available: boolean       // false → render "not available for summary-format reports"
  serversCovered: number   // contributing servers
  serversTotal: number     // servers in scope
  assetsCovered?: number   // e.g. copies in window, when meaningful
  assetsTotal?: number
}

export interface ReportView {
  // …existing fields unchanged…
  provenance: Record<MetricKey, MetricProvenance>
}
```

- `buildReportView` for a **detail** server sets every key `{ available: true, serversCovered: 1, serversTotal: 1, … }`.
- `summaryView` sets the four ⚠️ keys `available: false` (covered: 0/1) and the rest available.
- `mergeViews` recomputes each key across the estate (covered = servers where that metric was available; `available` true if ≥1 covered).

Universal metrics (overall coverage, jobs, policies, capacity totals, `mtreeCount`) are always available and need no per-widget gating.

### `compliance` gains raw counts (exact merge)

`compliance` is the only pct-only metric. To merge across servers without multiplying rounded percentages, add the raw numerators:

```ts
export interface Compliance {
  appConsistentPct: number; immutablePct: number; replicatedPct: number
  appConsistentCount: number; immutableCount: number; replicatedCount: number  // new
  backupLevelMix: Record<string, number>
  windowSize: number; capped: boolean
}
```

`computeCompliance` already counts these internally — it just stops discarding them. `mergeViews` sums counts and `windowSize`, then divides. (Coverage already carries counts; jobs carries counts+total; gaps carries count+capacity; policies/targets/`backupLevelMix` concatenate or sum — no other type change needed.)

### View-level merge — `mergeViews(perServer: ReportView[]): ReportView`

Pure, in `engines/aggregation/mergeViews.ts`. Combination rules:

- **coverage:** sum `overall` count bands, re-`finalize` pcts; `byType` is the union of detail servers' bands (summary servers contribute none — reflected in `coverageByType` provenance).
- **gaps:** sum `count` and `totalCapacityGb`; re-run `topN` over the concatenation of per-server `top.items` (correct: a global top-N member is always within its own server's top-N, so per-server top-N lists suffice); `top.total = Σ count`.
- **jobs:** sum `counts` dicts and `total`; `successPct = ΣSUCCESS / Σtotal`; `capped = any`.
- **compliance:** sum the three counts + `windowSize`; divide; merge `backupLevelMix`; `capped = any`.
- **capacity:** concat `targets` (and `flagged`); sum `mtreeCount`.
- **policies:** concat `perPolicy`; sum `count`; merge `byPurpose`.
- **inUse/idleAgents:** union in-use; idle = present-but-never-in-use (idle-on-A + in-use-on-B → in-use), mirroring today's `classifyAgents` semantics.
- **provenance:** computed per key from contributing servers.
- **single source:** `mergeViews([v])` returns `v` (identity), preserving standalone output.

### Estate warnings preserved, not rewritten

Today's `mergeWarnings` (`engines/parser/mergeWorkbooks.ts`) needs only `ServerWorkbook[]` (labels, meta, per-source warnings, host names, capped flags) — none of which depend on row-union. It is **extracted intact** as `estateWarnings(servers: ServerWorkbook[]): string[]` (attribution, base-10/base-2 unit mismatch, duplicate-server, blended-window). To preserve single-file output exactly, `estateWarnings` keeps `mergeWorkbooks`' identity behavior: for a **single** source it returns that workbook's `warnings` unchanged (no `[label]` attribution prefix, no estate warnings). One **new** umbrella warning is added (multi-source only) when `detectFormat` differs across servers:

> "Estate mixes detail-format and summary-format exports; metrics marked with a coverage note reflect only the servers that provide that data."

### Derivation — `hooks/useReportView.ts`

```ts
const perServer = servers.map((s) => ({
  label: s.label,
  version: appVersion(s.workbook),
  view: buildReportView(s.workbook),     // format-aware
}))
return {
  combined: { ...mergeViews(perServer.map((p) => p.view)),
              warnings: estateWarnings(servers) },
  perServer,
  multiSource: servers.length > 1,
}
```

`EstateView` shape is unchanged. `mergeWorkbooks` import is removed.

## Surfacing in dashboard / PPTX / HTML

- Universal metrics render exactly as today.
- Detail-only widgets read `view.provenance[key]`:
  - `available && serversCovered < serversTotal` → render the value **plus a coverage note** ("covers N of M servers" / "X of Y assets").
  - `!available` → a quiet **"Not available for summary-format reports"** state instead of an empty chart/zeroed KPI.
- The existing `WarningsBanner` carries the umbrella mixed-format note; per-widget notes sit next to the affected widget.
- Per-server breakdown already exists; a summary-format server simply shows its own unavailable sections.
- **Exports:** deck-driven model is unchanged structurally — `buildExportModel` reads provenance to (a) omit/relabel unavailable sections and (b) append coverage-note text to affected sections' captions. No new renderer code paths.

## Error handling

- Unparseable file → error surfaced for that file; batch continues (never-block, as today).
- Unknown sheet signature (neither detail nor summary) → treat as detail (current tolerant behavior: missing sheets → empty), and raise a single warning that the format was unrecognized. Never throw.
- Mixed units / suspected duplicates / capped sheets / mixed formats → warnings, never a hard stop.
- 0 servers → `null` view → upload zone only.

## Testing

- **Parity gate (key risk control):** before refactoring, pin `buildReportView(mergeWorkbooks(servers))` output for a detail-format estate (`ref/PPDM.xlsx` + the synthetic second-server fixture from the multi-server work — two *distinct* detail servers). After refactor, `{ ...mergeViews(servers.map(buildReportView)), warnings: estateWarnings(servers) }` must deep-equal it. Locks "detail estate unchanged"; the existing suite is the regression net.
- **`detectFormat` units:** summary vs detail signatures; unknown → detail + warning.
- **`captureMeta` / `appVersion`:** string-date parse; `Product Version` fallback.
- **`summaryView` units (fixtures = the three `chuv-*` files):** assert exact recovered numbers — VM count 1758, protected 1782, unprotected 43, job success totals from `Jobs Summary`, policy rows — and assert the four ⚠️ keys are `available: false`.
- **`mergeViews` units:** count/capacity sums; pct re-finalize; `topN` over concat; `backupLevelMix` merge; identity on single source; provenance math.
- **Mixed-estate test:** 1 detail + N summary → summed universals correct, detail-only metrics carry the right `serversCovered/serversTotal`, umbrella warning present.
- **Renderers:** widget shows coverage note when partial, "not available" when `!available`; `keyParity.test.ts` stays green.
- `npm run typecheck` (both tsconfigs), `lint`, full `vitest` green.

## Docs

- New ADR (0010) — *Format-aware ingestion & view-level merge*: records the summary/detail split, the seam moving from `mergeWorkbooks` to `mergeViews`, and the provenance model. Notes it supersedes ADR 0009's sheet-level merge mechanism (estate semantics unchanged).
- Touch ADR 0009 (merge now at the view level), README, USER-GUIDE (older exports supported; what's unavailable and why).

## Effort

≈ 2–3 focused days at the repo quality bar. The clean `ReportView` seam and preserved warning logic keep it in days.

| Area | Rough size |
|---|---|
| `detectFormat` + meta/version tolerances + tests | ~½ day |
| `summaryView` extractor + fixture tests (3 files) | ~1 day |
| `compliance` counts + `mergeViews` + parity gate + tests | ~1 day |
| Provenance plumbing into dashboard + exports + i18n (4 locales) | ~½ day |
| ADR 0010 + doc touch-ups | ~2h |

## Risks

1. **Parity regression** when retiring `mergeWorkbooks`. Mitigated by the pinned deep-equal gate run *before* the refactor.
2. **Excluded-count inference** (`Assets Count − protected − unprotected`) is an assumption; if a summary file disagrees, clamp at 0 and rely on the overall band. Validate against all three fixtures.
3. **Per-type coverage gap** reduces summary-file richness (Decision 4). Per-type capacity coverage remains a clean future add if wanted.
4. **`Jobs Summary` job-type vocabulary** differs from detail `Result` values; the normalized `counts` dict keys won't perfectly align across formats — acceptable because `successPct`/`total` are what's surfaced, but documented so the per-server job mix is read per-format.
