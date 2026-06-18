# Product Requirements Document — ppdm-report

**Version:** 1.0  
**Date:** 2026-06-18  
**Status:** Approved  
**Primary source:** [`docs/superpowers/specs/2026-06-18-ppdm-report-design.md`](superpowers/specs/2026-06-18-ppdm-report-design.md)  
**Cross-references:** [`README.md`](../README.md) · [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Overview and Problem Statement

Backup and data-protection teams that run Dell PowerProtect Data Manager (PPDM) periodically export their estate to a **Live Optics `.xlsx` file** for assessment, health checks, and pre-sales conversations.

Turning that raw export into a professional, shareable report today requires manual effort: copying figures between spreadsheet tabs, constructing charts, reformatting numbers, choosing which asset types to include, and producing a PPTX deck or HTML document from scratch. The process is slow, inconsistent, and error-prone — a practitioner touching a 31-sheet workbook with ~10,000-row capped sheets must track truncation caveats, coverage definitions, and compliance nuances by hand.

**ppdm-report** eliminates that manual work. A user drops a single `.xlsx` file and receives a professionally formatted, multilingual, dual-theme PPTX deck (plus an HTML companion) in seconds — all computed locally in the browser, with no data ever leaving the machine.

---

## 2. Goals and Non-Goals

### 2.1 Goals

| # | Goal |
|---|---|
| G1 | Accept a Live Optics PPDM `.xlsx` export (31 sheets) and produce a report entirely client-side. |
| G2 | Export to **PPTX** (primary deliverable) and **HTML** (companion). |
| G3 | Support four languages: **French (fr), English (en), German (de), Italian (it)**. |
| G4 | Provide **auto dark mode** on screen; PPTX and HTML exports follow the active web theme (light or dark). |
| G5 | Validate protection value and surface key metrics: coverage, gaps, job health, compliance, capacity, policies. |
| G6 | **Skip** slides for asset types that are not in use (N/A-only rows). |
| G7 | **Include** one slide listing agents that are present but not in use. |
| G8 | Support two **report flavors** — *Assessment* (pre-sales value story) and *Ops* (health/posture) — over one shared metric engine. |
| G9 | Provide a lean, single-page dashboard for validation and preview before export. |

### 2.2 Non-Goals (v1)

Per design spec §12:

- **No live PPDM API connection.** The Swagger files under `docs/swagger/` are build-time field-semantics references only; the tool never calls the PPDM REST API.
- **No server, persistence, or telemetry.** The application has no backend, stores no dataset rows, and transmits nothing.
- **No multi-extract merge or trends.** Each session processes a single `.xlsx`; trend analysis across multiple captures is deferred.
- **No sprawling multi-view UI.** The application is deck-first with one scrollable dashboard; additional views may be added in later versions if requested.

---

## 3. Users and Use Cases

### 3.1 Users

| Persona | Context |
|---|---|
| **Pre-sales / Assessment engineer** | Needs to quickly turn a customer PPDM export into a value story: what is protected, what is not, and what the opportunity looks like. Audience is the customer's IT management. |
| **Operations / Health engineer** | Needs a posture snapshot: job success rates, compliance gaps, capacity risk. Audience is internal or the customer's operations team. |

Both personas share the same tool and the same data; the **flavor toggle** determines which framing dominates.

### 3.2 Use Cases

**UC-1 — Assessment report (pre-sales)**  
The engineer drops the customer's Live Optics `.xlsx`, selects *Assessment* flavor and the customer's language, and exports a PPTX. The deck leads with protection coverage and unprotected-asset opportunity, then surfaces immutability and replication gaps.

**UC-2 — Ops health review**  
The engineer drops the export, selects *Ops* flavor, and exports a PPTX for a quarterly health meeting. The deck leads with job success rates and compliance SLA, then presents capacity risk and policy inventory.

**UC-3 — On-screen validation**  
Before exporting, the engineer reviews the auto-computed KPIs on the dashboard to verify the import was clean and that headline numbers match their expectations from the raw spreadsheet.

---

## 4. Functional Requirements

### 4.1 Input

| ID | Requirement |
|---|---|
| FR-IN-1 | Accept a single Dell Live Optics PPDM `.xlsx` file via drag-and-drop or file picker. |
| FR-IN-2 | Parse all **31 sheets** using SheetJS (CDN-pinned at 0.20.3); validate at the parse boundary with Zod; never re-validate in downstream engines. |
| FR-IN-3 | Detect **in-use asset types**: a sheet whose only data row(s) consist entirely of `N/A` is classified as *present but not in use*. All other sheets with data rows are *in use*. |
| FR-IN-4 | Acknowledge and surface that `Copies` and `Protection Job Activities` are **capped at 10,000 rows** by Live Optics; metrics derived from those sheets carry an explicit caveat (`windowSize`, `capped` flag). |
| FR-IN-5 | Extract capture metadata from the `Details` sheet: customer/project name, collector build version, capture date, base-10 flag. |

### 4.2 Metrics

All metrics are pure functions of the parsed rows, computed in `src/engines/aggregation/` and composed once in `reportView.ts`. No metric logic lives in the UI or store.

#### 4.2.1 Coverage (`coverage.ts`)

| ID | Requirement |
|---|---|
| FR-CV-1 | Compute per-type and overall **headline coverage**: `PROTECTED / (PROTECTED + UNPROTECTED)`. |
| FR-CV-2 | Compute **secondary coverage** including excluded assets: `PROTECTED / (PROTECTED + UNPROTECTED + EXCLUDED)`. |
| FR-CV-3 | Show the EXCLUDED asset count alongside both figures — nothing hidden. |
| FR-CV-4 | Coverage is computed only over in-use asset types. |

#### 4.2.2 Gaps (`gaps.ts`)

| ID | Requirement |
|---|---|
| FR-GP-1 | Compute the count of unprotected assets and the total unprotected capacity (TB, base-10). |
| FR-GP-2 | Return the unprotected asset list ranked by size, capped to the top 25, with total and shown counts. |

#### 4.2.3 Job health (`jobs.ts`)

| ID | Requirement |
|---|---|
| FR-JB-1 | Compute job result distribution: SUCCESS, RETRIED, SKIPPED, CANCELED. |
| FR-JB-2 | Compute overall job success rate. |
| FR-JB-3 | Return `capped: boolean` and `windowSize: number` when the source sheet was truncated at 10,000 rows. The slide must display the caveat. |

#### 4.2.4 Compliance (`compliance.ts`)

| ID | Requirement |
|---|---|
| FR-CM-1 | Compute application-consistency percentage, immutability percentage, replication percentage, and backup-level mix (full/log). |
| FR-CM-2 | Compute RPO recency distribution. |
| FR-CM-3 | Return `capped` and `windowSize` when the `Copies` sheet was truncated. Slides must display the caveat. |

#### 4.2.5 Capacity (`capacity.ts`)

| ID | Requirement |
|---|---|
| FR-CP-1 | Compute per-system Data Domain utilization percentage and flag systems above risk thresholds. |
| FR-CP-2 | Report the MTree count from `Data Domain Mtrees`. |

#### 4.2.6 Policies (`policies.ts`)

| ID | Requirement |
|---|---|
| FR-PL-1 | Summarize policies by purpose with asset count and protection capacity. |
| FR-PL-2 | Return a per-policy list capped to top 25 of N. |

#### 4.2.7 Agents (`rows.ts` / `detectInUse.ts`)

| ID | Requirement |
|---|---|
| FR-AG-1 | Classify every agent-type sheet as *in use* or *present not in use* using the N/A-placeholder rule. |
| FR-AG-2 | Expose both lists so the deck can skip slides for idle types and include the idle-agents slide. |

### 4.3 Dashboard

| ID | Requirement |
|---|---|
| FR-DB-1 | Render a single scrollable dashboard displaying hero KPIs, coverage (both figures), gaps, agent classification, and job health. |
| FR-DB-2 | Dashboard reflects the active theme (auto/light/dark) using ECharts SVG renderer. |
| FR-DB-3 | A **Flavor Toggle** switches between Assessment and Ops emphasis without reloading data. |

### 4.4 Report Flavors

| ID | Requirement |
|---|---|
| FR-FL-1 | **Assessment** flavor leads the deck with coverage → gaps/opportunity → immutability value story. |
| FR-FL-2 | **Ops** flavor leads the deck with job health → compliance/SLA → capacity risk. |
| FR-FL-3 | Both flavors use the identical `ReportView` metric model; flavor changes slide order and KPI emphasis only — never the numbers. |

### 4.5 Deck Structure

The deck contains ~15 slides for a typical estate (11 templates; slide 5 fans out per in-use type):

| Slide | Title | Conditional? |
|---|---|---|
| 1 | Title & context | Always |
| 2 | Executive summary | Always |
| 3 | Protection coverage | Always |
| 4 | Gaps & opportunity | Always |
| 5 | Per-type detail | One per in-use type |
| 6 | Agents present, not in use | Only if idle agents exist |
| 7 | Job health | Always |
| 8 | Compliance & SLA | Always |
| 9 | Capacity & storage | Always |
| 10 | Policies | Always |
| 11 | Appendix & data notes | Always |

The deck filename follows the pattern `ppdm-report_<customer>_<ISO date>.pptx`.

### 4.6 PPTX Export

| ID | Requirement |
|---|---|
| FR-PX-1 | Generate PPTX using pptxgenjs, off the main thread in a Web Worker. |
| FR-PX-2 | Apply **dual-theme** palette ("Midnight Executive" light or dark) matching the resolved web theme at export time. |
| FR-PX-3 | Use **Arial** for all text. |
| FR-PX-4 | Omit conditional slides when their data is empty or all types are in use. |
| FR-PX-5 | Cap all lists at top 25 of N; slides always render *"top 25 of N"* when N > 25. |
| FR-PX-6 | Print the capped-window caveat in-slide for job and compliance metrics when the source was truncated. |

### 4.7 HTML Export

| ID | Requirement |
|---|---|
| FR-HT-1 | Generate a self-contained HTML file (CSS inlined, zero external resources). |
| FR-HT-2 | Include a CSP meta tag; no JavaScript in the output. |
| FR-HT-3 | Match the active theme at export time. |

### 4.8 Internationalisation

| ID | Requirement |
|---|---|
| FR-I18N-1 | Support **fr, en, de, it** via react-i18next; UI language selectable via `LanguageToggle`. |
| FR-I18N-2 | All PPTX and HTML export strings are also translated (separate `report`/`pptx` namespace). |
| FR-I18N-3 | Numbers, dates, and units formatted by `utils/format.ts` (base-10 bytes); never pre-formatted in translation strings. |
| FR-I18N-4 | A **key-parity CI test** fails if any locale is missing a key present in another locale. |

---

## 5. Non-Functional Requirements

### 5.1 Privacy

| ID | Requirement |
|---|---|
| NFR-PV-1 | **100% client-side.** No data, metric, or row leaves the browser. |
| NFR-PV-2 | `privacy/fetchGuard.ts` throws synchronously on any non-same-origin network request. |
| NFR-PV-3 | CSP meta blocks third-party connections. |
| NFR-PV-4 | No dataset rows are written to `localStorage` or `sessionStorage`. Only `ppdm-report-theme` and `ppdm-report-lang` UI keys persist across sessions. Refreshing the page clears the loaded data. |

### 5.2 Units

| ID | Requirement |
|---|---|
| NFR-UN-1 | All capacity figures use **base-10 units** (1 TB = 10^12 bytes) throughout the app, PPTX, and HTML. |
| NFR-UN-2 | The `Details` sheet base-10 disclaimer is surfaced in the appendix slide. |

### 5.3 Honesty and Transparency

| ID | Requirement |
|---|---|
| NFR-HN-1 | **No silent caps or fallbacks.** Any truncation or omission is stated in the artifact that presents the data. |
| NFR-HN-2 | Capped-sheet metrics always display the window size and the caveat label (e.g., *"based on most recent 10,000 jobs"*). |
| NFR-HN-3 | Lists longer than 25 items display *"top 25 of N"* so the audience knows truncation occurred. |

### 5.4 Visual Design

| ID | Requirement |
|---|---|
| NFR-VD-1 | **Typeface: Arial** everywhere — slides, web app, HTML export. |
| NFR-VD-2 | **Palette: "Midnight Executive"** with accent blue; severity green/amber/red; excluded assets in muted grey. All colors are sRGB hex (zrender/PPTX cannot parse oklch). |
| NFR-VD-3 | **16:9 slide layout** with header (title / customer / build / date / flavor tag), accent rule, KPI band, chart/table zone, and footer (base-10 note + capped caveats + page number). |

### 5.5 Quality Gates (CI-blocking)

| Gate | Requirement |
|---|---|
| Typecheck | `tsc --noEmit` must pass with zero errors. |
| Lint | Biome formatter + linter must report no violations. |
| Tests | No failing or skipped tests (`vitest run`). |
| Coverage | Engine, utility, and privacy coverage ≥ **75%** (`vitest run --coverage`). |
| Supply chain | CDN-pin check + telemetry denylist must pass (`scripts/check-supply-chain.mjs`). |
| Bundle size | ECharts bundle within budget (checked in CI). |
| i18n parity | Key-parity test must pass for all four locales. |

### 5.6 Architecture Invariants

| ID | Requirement |
|---|---|
| NFR-AR-1 | `engines/` are **pure functions only** — no classes, no mutation, no side effects, no React/DOM/Zustand imports. |
| NFR-AR-2 | The Zustand store holds `ReportInput` and UI selections only. Every metric is derived in `useReportView`; nothing is stored pre-computed. |
| NFR-AR-3 | SheetJS (`xlsx`) is imported **only** in `engines/parser/readWorkbook.ts` inside the parser worker. |
| NFR-AR-4 | ECharts is imported **only** in `components/Chart.tsx`. |
| NFR-AR-5 | `today` is injected into engines; `Date.now()` is never called inside engine code (ensures deterministic testing). |

---

## 6. Success Criteria

The WHO sample (`ref/PPDM.xlsx`) is the canonical reference fixture. The following values, derived from the design spec §5, must render correctly without modification:

| Metric | Expected value |
|---|---|
| Overall headline coverage | **71.4%** |
| Overall coverage incl. excluded | **51.7%** |
| File Systems coverage | **43.4%** |
| Exchange coverage | **100%** |
| SQL Server coverage | **71.7%** |
| VM coverage | **78.9%** |
| Unprotected assets | **281** |
| Unprotected capacity | **263 TB** |
| Job window: SUCCESS | **9,297** |
| Job window: RETRIED | **635** |
| Job window: SKIPPED | **66** |
| Job window: CANCELED | **2** |
| App-consistent copies | **77%** |
| Immutable copies | **0%** |
| Replicated copies | **32%** |
| Full / log backup mix | **49% / 48%** |
| Data Domain utilization | **87.6% / 89.6%** |
| In-use asset types | **5** |
| Idle agents | **13** |

These values are asserted in the engine test suite using `ref/PPDM.xlsx` as the fixture. Divergence from any value above is a blocking defect.

---

## 7. Out of Scope and Future Considerations

### 7.1 Out of Scope (v1)

- **Live PPDM API mode.** The Swagger JSON files are field-semantics references used only during development. The tool never authenticates to or queries a running PPDM instance.
- **Per-type dedicated slides beyond the table layout.** Slide 5 (per-type detail) currently uses a table; richer per-type chart layouts are deferred.
- **Multi-extract trends.** Comparing two or more captures over time requires a persistence model not present in v1.
- **Server-side rendering or PDF export.** The export surface is PPTX + HTML only.

### 7.2 Future Considerations

- **Live API mode** if a customer wants a real-time posture view rather than a snapshot-based one.
- **Per-type dedicated chart slides** (e.g., a scatter plot of VM size vs. protection status) when the table alone proves insufficient.
- **Trend analysis** across multiple Live Optics captures, once a storage/persistence model is defined that preserves the privacy invariant.
- **Additional asset-type depth** — dedicated slides per type with richer visualisations, activated automatically when a type crosses a threshold of assets.
