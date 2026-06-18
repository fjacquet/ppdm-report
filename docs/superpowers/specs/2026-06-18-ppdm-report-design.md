# PPDM Report — Design Spec

**Date:** 2026-06-18
**Status:** Approved (design phase)
**Foundation:** [vatlas](/Users/fjacquet/Projects/vatlas) — same architecture and stack.

---

## 1. Purpose

A 100% client-side tool that converts a Dell **Live Optics PPDM extract** (`.xlsx`) into a
professional, multilingual report with **PPTX + HTML export**. The PPTX deck is the primary
deliverable; the on-screen app is a lean validation/preview surface.

Sample input: `ref/PPDM.xlsx` (a Live Optics export of the WHO PPDM estate, 31 sheets, ~2.4 MB).
Reference only: `docs/swagger/*.json` (PPDM REST API v1/v2/v3) — used at build time to understand
field semantics. **The tool never calls the API.**

### Core requirements

1. Ingest a Live Optics PPDM `.xlsx`, fully client-side (privacy-preserving, like vatlas).
2. Produce a professional report; export to **PPTX** and **HTML**.
3. Languages: **fr / de / it / en**.
4. **Auto dark mode** on screen; the **PPTX export follows the live web theme** (light *or* dark).
5. Validate the value and highlight key metrics (protection posture, gaps, compliance, capacity).
6. **Do not** create dedicated slides for asset types that are not in use.
7. **Do** include one slide listing agents that are *present but not in use*.

---

## 2. Locked decisions

| Decision | Outcome |
|---|---|
| Input source | **Live Optics `.xlsx` only**, 100% client-side. Swagger = build-time schema reference. |
| Codebase | **Fresh repo, same stack** as vatlas. Copy patterns; no shared git history. |
| Report flavors | **Two flavors via config toggle** — *Assessment* (pre-sales value) and *Ops* (health/posture) — over **one shared metric engine**. Flavor changes slide order/emphasis, never the numbers. |
| Coverage metric | Headline = `PROTECTED / (PROTECTED + UNPROTECTED)`; **secondary** "including excluded" = `PROTECTED / (PROTECTED + UNPROTECTED + EXCLUDED)`; EXCLUDED count shown. Nothing hidden. |
| App scope | **Deck-first, lean app** — one scrollable dashboard + upload + export. |
| PPTX theme | **Both light and dark variants**, selected from the resolved web app theme at export time (diverges from vatlas's light-only). |
| Typeface | **Arial** everywhere (slides, app, HTML export). |
| "In use" test | An asset-type sheet whose only data row(s) are the `N/A` placeholder is **present but not in use**. |

### Engineering principles (non-negotiable)

- **KISS / DRY / functional.** `engines/` are pure functions only — no classes, no mutation, no
  side effects, no React/DOM/store deps. One composition root; zero duplicated derivation logic.
- **Quality first.** No failing/skipped tests, no half-built features, no silent fallbacks. Fail
  loudly and visibly. CI gates block on red.
- **No silent caps or fallbacks.** Where data is truncated or omitted, say so *in the artifact*.

---

## 3. Architecture

Same three-tier spine as vatlas, enforced structurally:

```
pure engines/  →  inputs-only Zustand store  →  one bridge hook  →  lean UI + export workers
```

### Data flow (single pass, recompute-never-cache)

```
PPDM.xlsx drop
  └─ useReportUpload (main thread): File → ArrayBuffer → parser worker
       └─ parser.worker.ts        ← ONLY xlsx import site; posts typed rows, never the workbook
            ├─ parseXlsx()         SheetJS (CDN tarball pin, CVE-safe 0.20.3 — as vatlas)
            ├─ normalizeSheets()   31 sheets → typed rows; Zod-validated at THIS boundary only
            ├─ detectInUse()       N/A-placeholder rule → in-use vs present-not-in-use
            └─ captureMeta()       customer, collector build, capture date, base-10 flag
  → store: ReportInput            (raw typed rows + UI selections ONLY — no derived metrics)
  → useReportView(flavor)         THE single useMemo: buildReportView(input, flavor, today)
       └─ engines/aggregation/    pure: coverage, gaps, jobs, compliance, capacity, policies, agents
  → Dashboard (one scrollable view)  +  Export worker → PPTX (themed) / HTML
```

### `src/` layout (mirrors vatlas module-per-domain)

```
src/
├── main.tsx                       # fetchGuard → i18n → App
├── privacy/fetchGuard.ts          # REUSED: synchronous throw on non-same-origin requests
├── engines/
│   ├── parser/                    # PPDM-SPECIFIC
│   │   ├── parser.worker.ts       # only xlsx import; posts typed rows
│   │   ├── parseXlsx.ts           # SheetJS wrapper
│   │   ├── normalizeSheets.ts     # 31 sheets → typed rows (Zod boundary)
│   │   ├── detectInUse.ts         # N/A-placeholder rule
│   │   └── captureMeta.ts         # customer / collector build / date / base-10
│   ├── aggregation/               # PPDM-SPECIFIC, pure
│   │   ├── reportView.ts          # composition root → ReportView (the one memo target)
│   │   ├── coverage.ts            # per-type + overall protection coverage (both figures)
│   │   ├── gaps.ts                # unprotected assets + total unprotected capacity
│   │   ├── jobs.ts                # job result distribution + success rate (+ capped flag)
│   │   ├── compliance.ts          # consistency, immutability, replication, RPO recency
│   │   ├── capacity.ts            # Data Domain / storage-target utilization + risk thresholds
│   │   ├── policies.ts            # policy count by purpose, assets & protection capacity
│   │   └── agents.ts              # in-use vs present-not-in-use classification
│   ├── units/                     # REUSED: branded number types
│   └── export/
│       ├── export.worker.ts       # REUSED shell: synthesize export off main thread
│       ├── buildExportView.ts     # PPDM-specific export shape
│       ├── pptx/
│       │   ├── builder.ts         # slide emission root (flavor-ordered)
│       │   ├── theme.ts           # Midnight Executive LIGHT + DARK palettes (Arial)
│       │   ├── primitives/        # REUSED: kpiCard, progressBar, chartImage, table…
│       │   └── slides/            # PPDM-specific: title, execSummary, coverage, gaps,
│       │                          #   perType, idleAgents, jobs, compliance, capacity,
│       │                          #   policies, appendix
│       └── html/                  # REUSED pattern: renderReport.tsx + assembleHtml.ts
├── store/reportStore.ts           # inputs-only Zustand (ReportInput + flavor/lang/theme)
├── hooks/
│   ├── useReportUpload.ts         # file drop → worker → store
│   ├── useReportView.ts           # THE single useMemo (store → ReportView)
│   ├── useTheme.ts                # REUSED: auto/light/dark + localStorage
│   └── useExport.ts               # REUSED shell: resolve inputs on main thread → worker
├── components/
│   ├── Chart.tsx                  # REUSED: only ECharts import site (SVG renderer)
│   ├── UploadZone.tsx / ExportButtons.tsx / LanguageToggle.tsx / ThemeToggle.tsx / FlavorToggle.tsx
│   └── dashboard/                 # one scrollable dashboard (KPIs, coverage, gaps, agents)
├── theme/echartsTheme.ts          # REUSED: light/dark ECharts theme (adapt palette)
├── i18n/                          # REUSED scaffold: en/fr/de/it namespaces + key-parity test
├── types/                         # PPDM row + ReportView contracts
└── utils/format.ts                # REUSED: locale number/date/bytes (base-10)
```

**Store = inputs only.** Holds parsed `ReportInput` + UI selections (`flavor`, `language`, `theme`).
Every metric is derived in `useReportView`, never stored — same invariant as vatlas. Privacy
invariant carried over verbatim (synchronous throw on non-same-origin, CSP meta, no dataset rows in
persistent storage; only `ppdm-report-theme` / `ppdm-report-lang` UI keys persist).

---

## 4. Input data model

The Live Optics export has **31 sheets**. Salient ones:

| Sheet | Role | Notes |
|---|---|---|
| `Details` | Capture metadata | Customer/project, date, collector build, base-10 disclaimer |
| `System Information` | PPDM appliance | host, PowerProtect version, uptime |
| Asset-type sheets (≈25) | Per-type assets | `Protection Status` ∈ {PROTECTED, UNPROTECTED, EXCLUDED}, `Protectable`, policy, capacity |
| `Copies` | Backup copies | **capped at 10,000 rows**; consistency/lock/replica/retention/dates |
| `Unprotected Assets` | Gap list | name, type, size |
| `Policies` | Protection policies | purpose, #assets, protection capacity |
| `Protection Job Activities` | Job runs | **capped at 10,000 rows**; State/Result/times |
| `Storage Targets`, `Data Domain Mtrees` | Capacity | utilization %, capacity |

### In-use detection (`detectInUse.ts`)

An asset-type sheet is **present but not in use** iff its only data row(s) consist entirely of the
`N/A` placeholder. Otherwise it is **in use**. Drives both requirement #6 (skip dedicated slides)
and #7 (the idle-agents slide) — one mechanism.

### Capped-data handling

`Copies` and `Protection Job Activities` are truncated by Live Optics at exactly 10,000 rows.
Therefore:

- Per-asset/whole-estate **totals** are sourced from aggregate sheets (`Policies`, `Storage
  Targets`, `Unprotected Assets`, asset-type counts), **not** by counting capped sheets.
- Metrics necessarily derived from capped sheets (job result mix, compliance distributions) are
  computed over the available **window** and labelled in-place: *"based on most recent 10,000 …"*.
- `jobs.ts` and `compliance.ts` return a `capped: boolean` and `windowSize: number` so slides print
  the caveat. **Never silent.**

---

## 5. Metric / value engines (pure FP)

Each is a pure function `(typed rows) → value`, composed once in `buildReportView`. Signatures
illustrative; no logic in UI or store.

```ts
computeCoverage(assets): { byType: Map<Type, Band>, overall: Band }
// Band = { protected, unprotected, excluded,
//          pct,            // protected/(protected+unprotected)  — headline
//          pctInclExcluded // protected/(p+u+excluded)           — secondary }

findGaps(assets, unprotectedSheet): { count, totalCapacity, top: Asset[] }   // ranked by size
classifyAgents(sheets): { inUse: Type[], presentNotInUse: Type[] }
computeJobs(jobActivities): { success, retried, skipped, canceled, successPct, capped, windowSize }
computeCompliance(copies): { appConsistentPct, immutablePct, replicatedPct,
                             backupLevelMix, rpoRecency, capped, windowSize }
computeCapacity(storageTargets, mtrees): { systems: Util[], flagged: Util[], mtreeCount }
summarizePolicies(policies): { count, byPurpose, perPolicy: PolicyRow[] }
```

**`topN` helper (DRY):** every list-bearing metric returns `{ items: T[], total: number, shown: number }`
with `shown = min(25, total)` so the slide can always render *"top 25 of N"*. Single helper, reused.

### Reference values (WHO sample — illustrative, not hardcoded)

Overall coverage 71.4% (51.7% incl. excluded); File Systems 43.4%, Exchange 100%, SQL 71.7%, VMs
78.9%. 281 unprotected assets / 263 TB. Jobs (10k window): 9,297 SUCCESS / 635 RETRIED / 66 SKIPPED
/ 2 CANCELED. Compliance (10k window): 77% app-consistent, **0% immutable**, 32% replicated, 49/48%
full/log. Data Domain utilization 87.6% / 89.6%. 5 in-use types; 13 idle agents.

---

## 6. Report flavors

One `ReportView`; flavor is a pure ordering/emphasis selector.

- **Assessment** (pre-sales value): leads coverage → gaps/opportunity → immutability value story.
- **Ops** (health/posture): leads job health → compliance/SLA → capacity risk.

Slide *set* is identical; only lead order and which KPIs headline change. No second engine.

---

## 7. Deck structure

~15 slides for the sample (11 templates; slide 5 fans out per in-use type → 4 + 5 + 6 = 15).

| # | Slide | Always? | Notes |
|---|---|---|---|
| 1 | Title & context | always | customer, collector build, capture date, flavor, language |
| 2 | Executive summary | always | hero KPIs incl. immutability flag |
| 3 | Protection coverage | always | overall donut + per-type bars (both figures) · *assessment-lead* |
| 4 | Gaps & opportunity | always | unprotected assets + capacity · **top 25 of N** · *assessment-lead* |
| 5 | Per-type detail | conditional | **one per in-use type**; coverage + table **top 25 of N** |
| 6 | Agents present, not in use | always (if any) | the idle agent types on one slide |
| 7 | Job health | always | result mix + success rate · **capped-window caveat** · *ops-lead* |
| 8 | Compliance & SLA | always | consistency / immutability / replication / RPO · **capped caveat** · *ops-lead* |
| 9 | Capacity & storage | always | Data Domain utilization flagged · *ops-lead* |
| 10 | Policies | always | by purpose; per-policy **top 25 of N** |
| 11 | Appendix & data notes | always | base-10, capped-sheet caveats, collector build, KB link, disclaimer |

---

## 8. Visual design

- **Typeface: Arial** (slides, app, HTML).
- **Palette: "Midnight Executive"** in light and dark. Accent blue; severity green/amber/red;
  EXCLUDED in muted grey. Colors are sRGB hex (zrender/PPTX cannot parse oklch).
- **Layout grammar:** 16:9 slide; header (title / customer / build / date / flavor tag), accent
  rule, KPI band (left-accent cards), lower zone (chart panel + findings/table), footer (base-10 +
  capped caveats + page).
- **Dual-theme PPTX:** `export.worker` receives the resolved theme (`light` | `dark`) and
  `pptx/theme.ts` supplies the matching palette. HTML export likewise follows the theme.
- Approved mockups archived under `.superpowers/brainstorm/` (exec summary + per-type, both themes).

---

## 9. Cross-cutting (reused from vatlas)

- **i18n (react-i18next):** en/fr/de/it; per-view JSON namespaces + a `report`/`pptx` namespace
  for export strings; **key-parity test** fails CI on a missing key; numbers/dates/units formatted
  by `utils/format.ts` (base-10), never pre-formatted in translation strings.
- **Auto dark mode (`useTheme`):** `auto` follows `prefers-color-scheme`; `light`/`dark` override;
  persisted in `ppdm-report-theme`; toggles `.dark` on `<html>`; ECharts picks the matching
  registered theme.
- **Privacy:** `fetchGuard` throws synchronously on any non-same-origin request; CSP meta blocks
  third-party connections; no dataset rows persisted (refresh = data gone).
- **Charts:** `Chart.tsx` is the only ECharts import site (SVG renderer, tree-shaken); SSR render
  to SVG for HTML export; rasterize to PNG for PPTX.

---

## 10. Exports

- **PPTX (pptxgenjs):** flavor-ordered slides, dual-theme, Arial, conditional slides omitted when
  empty, lists capped to top-25-of-N. Filename `ppdm-report_<customer>_<ISO date>.pptx`.
- **HTML:** self-contained, CSS inlined, CSP meta, theme-matched, zero JavaScript.

---

## 11. Testing & tooling (quality-first)

- **Vitest:** engines/utils/privacy ≥75% coverage gate (as vatlas). Pure engines are unit-tested
  directly (deterministic — `today` injected, never `Date.now()` inside engines).
- **Fixtures:** the WHO `ref/PPDM.xlsx` plus a small synthetic workbook covering edge cases
  (all-idle agents, empty estate, capped sheets, mixed protection states).
- **Biome:** formatter + linter, copied config.
- **CI gates:** typecheck → lint → test → build → supply-chain (telemetry denylist + xlsx CDN-pin
  check) → bundle-size (ECharts ≤ budget). Red blocks merge.

---

## 12. Non-goals (YAGNI)

- No live PPDM API connection (swagger is reference only).
- No multi-view sprawling UI (deck-first, one dashboard; views can grow later if needed).
- No server, no persistence of dataset rows, no telemetry.
- No multi-extract merge/trends in v1 (single extract per session). Revisit only if requested.

---

## 13. Reuse map

| Reused largely as-is | PPDM-specific (new) |
|---|---|
| `privacy/fetchGuard`, `hooks/useTheme`, `theme/echartsTheme`, `components/Chart`, `i18n/` scaffold, `engines/units`, `export/{pptx,html}` orchestration + primitives + worker, Vite/Biome/Vitest/CI config | `engines/parser/*`, `engines/aggregation/*`, `export/pptx/slides/*`, `export/buildExportView`, row + ReportView types, dashboard components, dual-theme PPTX palette |
