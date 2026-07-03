# Activity & Sizing Summary (Dell-parity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deck a strict superset of the official Dell Live Optics deck (per-type operational stats, largest/slowest backups, daily transfer trend, OS split) and add a sizing-summary section aggregating the estate's infrastructure-sizing inputs.

**Architecture:** One pure engine `src/engines/aggregation/activity.ts` (the fifth and last family-style module) computing five sub-metrics from normalized rows; Avamar + NetWorker adapters; the established wiring/i18n/export/dashboard cycle. The sizing summary is RENDER-ONLY — a new export/dashboard section that aggregates values ALREADY on ReportView (frontEnd, efficiency, capacityTrend, reliability, hygiene, gaps); no new engine data, no new ReportView field for it.

**Benchmarks:** official Dell decks in `/Users/fjacquet/Library/CloudStorage/OneDrive-Home/JTI/*.pptx` (8 slides: Profile / Summary of all Devices / Topology / 60-day jobs + longest / Top-5 policies by retention / Top-10 largest / daily transfer / Top-5 slowest).

## Global Constraints

- Engines pure; presence-gate every cell read; no vendor-computed rates (Dell's per-type "Monthly Growth Rate %" is deliberately NOT reproduced — our capacity-trend slopes cover growth honestly; NetWorker's per-client "Monthly Growth Cap. (GB)" stays unused pending a data-honesty decision).
- Slowest-backups floor: only jobs ≥ **1 GiB** qualify (tiny jobs produce meaningless MB/s). Largest = top **10** by capacity; slowest = top **5** by MB/s ascending.
- Daily series: per-day sums over the job window; dashboard renders a line chart (LineChart already registered); exports render a **weekly-bucketed** table (ISO-week start day as label) + last-8-weeks deck bars — never 60 table rows in a deck.
- Per-type stats: capacity GiB (sum), distinct clients, files (sum), per-type change rate (Avamar only: DPN bytes sent/processed per type, num/den carried). NetWorker fills capacity/clients/files from `Jobs`+`Backups` where present; change rate stays Avamar-only.
- OS split: distinct clients per OS family — Avamar `Avamar DPN Summary` `OS` column (map contains 'windows' → Windows, 'linux' → Linux, else Other); NetWorker `Clients` `Client OS Type`.
- Sizing summary values come from existing ReportView fields only; every line carries its source qualifier (measured / observed); inactive-client netting shown as "N of M clients inactive — consider netting out".
- i18n ×4 (keyParity); Biome authoritative; makeWorkbook({}) throws; ALL subagents sonnet; commit per green task.

---

### Task 0: Branch
- [ ] `git checkout main && git pull && git checkout -b feat/activity-sizing`

### Task 1: Activity engine
Create `src/engines/aggregation/activity.ts` + test. Exact exports:
- `interface ActivityJob { host: string; type: string; os: string; day: string; sizeGb?: number; files?: number; throughputMbSec?: number; sentBytes?: number; processedBytes?: number }`
- `interface TypeStats { type: string; capacityGb: number; clients: number; files: number; changeRate?: WeightedRatio }` (reuse `WeightedRatio` from './efficiency')
- `interface BigBackup { host: string; type: string; sizeGb: number; files?: number }`
- `interface SlowBackup { host: string; type: string; throughputMbSec: number; sizeGb: number }`
- `interface DailyPoint { day: string; gb: number; jobs: number }`
- `interface OsSplit { counts: Record<string, number> }` (keys Windows/Linux/Other)
- `interface Activity { byType: TypeStats[]; largest: TopList<BigBackup>; slowest: TopList<SlowBackup>; daily: DailyPoint[]; osSplit?: OsSplit }`
- `emptyActivity()`, `computeActivity(jobs: ActivityJob[]): Activity`, `mergeActivity(list)` (identity/empty/fold: byType re-aggregated by type with num/den + capacity/files sums + client-set sizes NOT recoverable post-hoc → carry clients as count, fold by SUM with a comment that cross-server client overlap is not deduplicable; largest/slowest concat+recap; daily summed per day; osSplit counts summed).
- Constants: `LARGEST_N = 10`, `SLOWEST_N = 5`, `SLOWEST_MIN_GB = 1`.
- TDD: per-type aggregation (distinct clients, files, change ratio), largest ordering, slowest floor + ascending order, daily sums + day sort, OS mapping, merge identity/fold.

### Task 2: Wiring
Template = family-4 commit (`git show 8b21fc5`): MetricKey `'activity'`, `ReportView.activity: Activity` after `hygiene`, factories gain `activityAvailable` (PPDM unavailable + comment), mergeViews fold + key, compiler sweep (`activity: emptyActivity(),`), builders pass false + next-task markers. Full gates.

### Task 3: Avamar adapter
`src/engines/products/avamar/activity.ts`: everything from `Job List Detailed` `Backup`-type rows — type = `Policy Type`, size = `Capacity (GiB)`, files = `# Files`, throughput = `MB/sec`, day = `Start Date` serial, host = `Host`, os = `Operating System` (all presence-gated). `TypeStats.changeRate` stays `undefined` for Avamar v1 — the byte columns live in `Avamar DPN Summary`, which carries no policy type, and cross-sheet host-joins would be guesswork; the estate-wide change rate already ships in `efficiency`. (Binding: Task 1 keeps the field optional.)
Wire into buildAvamarView (compute once, provenance flag = byType.length > 0 || daily.length > 0).
Tests: fixture with Job List Detailed rows → per-type capacity/clients/files, largest/slowest with floor, daily sums, OS split; Details-only → empty.

### Task 4: NetWorker adapter
`src/engines/products/networker/activity.ts`: from `Jobs` backup-type rows (reuse `/save|backup/i`): day/host/size (`Size (GB)` presence-gated — 'N/A' rows skipped for size but still count as jobs in daily), files (`Number of Files`), no throughput (skip slowest — stays empty TopList), type from... Jobs has no workload type → per-type stats from `Backups` sheet (`Backup Type`, `Backup Size (GB)`, `Number of Files`, `Client Name`); OS split from `Clients` `Client OS Type`. Daily from Jobs Start Time serials. Wire + tests (incl. slowest empty).

### Task 5: Tones + i18n ×4
No new tones needed (reuse backupDurationTone conventions? largest/slowest are informational — muted/accent; daily trend informational). i18n `activity` block ×4: title "Backup activity", perType table headers (type/capacity/clients/files), largest "Top 10 largest backups" (client/type/size/files), slowest "Top 5 slowest backups" (client/type/throughput/size), daily "Daily data transfer" + weekly table headers (week/transferred/jobs), osSplit "Client operating systems", takeaway "{{gb}} transferred across {{jobs}} jobs in the window" (values pre-formatted), floorNote "Only backups ≥ 1 GiB rank for throughput." Translations fr/de/it idiomatic (caption conventions per locale). ALSO add `sizing` block ×4 (Task 7 consumes): title "Sizing inputs", rows fetb/changeRate/dedupe/retentionShort/retentionLong/growth/windowPressure/inactiveNote labels + "measured"/"observed" qualifiers — exact strings chosen by implementer following deck tone, reviewed for naturalness.

### Task 6: Activity export + dashboard sections
sectionOrder `'activity'` after 'jobs' ops flavor / after 'longestBackups' assessment; export section (per-type table primary + largest/slowest as second table is NOT allowed by one-table rule → bind: table = per-type stats; largest+slowest render as deck bars? NO — bind cleanly: THREE ExportSections: 'activity' (per-type table + daily deck bars + takeaway), 'largestBackups' (table-first like longestBackups precedent), 'slowestBackups' (table-first). All three ids in the union + both flavors adjacent to 'longestBackups'. OS split = bars on the 'activity' deck). Dashboard: ActivitySection (per-type table + daily line chart via new dailyOption.ts pure builder + OS bars) + reuse table-first sections pattern for largest/slowest (one component with props or two small ones — implementer's call, tests either way). Suppress-on-empty everywhere.

### Task 7: Sizing summary section (render-only)
Export + dashboard section `'sizing'` (assessment flavor: right after 'perServer'; ops: near end). Content rows (each label + value + qualifier, skipping unavailable ones): total protected FETB (sum frontEnd protectedFetbGb), daily change rate (efficiency.changeRate), dedupe commonality / DD reduction (efficiency.dedupe), retention capacity <60d vs ≥1y (efficiency.retention buckets), fastest utilization growth (max capacityTrend slope + target), backup-window pressure (reliability queue delayedPct + gt8h count), inactive clients to net out (hygiene countByKind.clientInactive + total clients if cheaply available — else just the count). Table-first (label/value/qualifier), deck chips: FETB + change rate + reduction. All values read from the view — NO new engine computation beyond sums of existing arrays. Tests: fixture with all families populated → all rows; sparse view → only available rows, section suppressed when nothing available.

### Task 8: Gates, smoke, final review, PR
Full CI + smoke (extend tsx script: activity byType/largest/slowest/daily counts + sizing rows on POLGST + AVU203 + NetWorker lab; verify vs Dell deck values where visible: POLGST largest backup ≈ 1773.03 GiB polgst01-avs-04 — direct cross-check against the official deck!). Final sonnet whole-branch review (seams: GiB/GB bases per product, 0..1 vs 0..100, one-ECharts-import, suppression, table caps, no vendor rates). Push + PR.

## Out of scope
- Dell's per-type Monthly Growth % (vendor-derived); NetWorker Monthly Growth Cap (GB) column (honesty decision pending); PPDM activity wiring; Environmental-topology diagram.
