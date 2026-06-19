# ppdm-report

[![CI](https://github.com/fjacquet/ppdm-report/actions/workflows/ci.yml/badge.svg)](https://github.com/fjacquet/ppdm-report/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/fjacquet/ppdm-report?sort=semver&label=release)](https://github.com/fjacquet/ppdm-report/releases)
[![PWA](https://img.shields.io/badge/PWA-installable%20%C2%B7%20offline-5A0FC8?logo=pwa&logoColor=white)](docs/USER-GUIDE.md)
[![Privacy](https://img.shields.io/badge/privacy-100%25%20client--side-2ea44f)](docs/adr/0001-privacy-invariant.md)

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)

Drop a Dell Live Optics PPDM `.xlsx` extract and get a professional, multilingual dashboard with one-click PPTX and HTML export — 100% client-side. Your workbook never leaves the browser.

---

## What it does

**ppdm-report** ingests the Live Optics export of a Dell PowerProtect Data Manager (PPDM) estate (31 sheets, covering assets, jobs, copies, policies, storage targets) and surfaces the data as an interactive dashboard and a print-ready slide deck.

Key capabilities:

- **Two report flavors** — *Assessment* (pre-sales: leads with coverage and gaps) and *Ops* (health/posture: leads with job health and compliance/SLA) — driven by a single shared metric engine; only the slide order and KPI emphasis change.
- **Protection coverage** — headline `PROTECTED / (PROTECTED + UNPROTECTED)` plus a secondary figure including EXCLUDED assets; neither number is hidden.
- **Unprotected-gap analysis** — count, total capacity, and top-N assets ranked by size.
- **Job health** — result distribution (SUCCESS / RETRIED / SKIPPED / CANCELED) and success rate over the most recent up-to-10,000-row window, with an explicit in-place caveat when capped.
- **Compliance** — app-consistency, immutability, replication, and RPO recency; same capped-window caveat when applicable.
- **Capacity** — Data Domain / storage-target utilization with risk-threshold flags.
- **Policies** — count by purpose, per-policy asset and capacity breakdown (top 25 of N).
- **Agent classification** — asset types with only N/A placeholder rows are listed on a dedicated "present but not in use" slide; dedicated per-type detail slides are generated only for in-use types.
- **Auto dark mode** — follows `prefers-color-scheme`; light/dark override persisted in `localStorage`.
- **FR / EN / DE / IT** — full UI and export strings; a key-parity test fails CI on any missing translation key.
- **Multi-server estate** — drop several Live Optics exports to merge them into one combined report, with a per-server breakdown and clear caveats when sources don't cleanly combine.
- **Summary-format support** — older PPDM releases produce pre-aggregated "summary" exports (sheets named `... Count And Cap` / `... Assets & Cap`) rather than per-asset rows. These are supported and can be mixed freely with current detail exports in the same estate. Overall coverage counts, capacity, jobs, policies, DD mtree count, and in-use agent types are recovered from summary files. Per-asset detail — per-type coverage breakdown, the unprotected-asset list, copy compliance (immutability / replication), and storage-target utilization — is not present in older exports and is shown as "not available" with a coverage note indicating how many servers contributed that metric.
- **PPTX + HTML export** — both follow the live theme (light or dark) and the selected language. PPTX filename: `ppdm-report_<customer>_<ISO date>.pptx`. HTML is self-contained, CSS-inlined, zero JavaScript.

---

## Stack

| Layer | Library | Version |
|---|---|---|
| UI framework | React | ^19.2.6 |
| Language | TypeScript (strict) | ^5.6.0 |
| Build | Vite | ^6.0.0 |
| Styling | Tailwind CSS v4 (class-based dark mode) | ^4.0.0 |
| State | Zustand | ^5.0.13 |
| Validation | Zod | ^4.4.3 |
| i18n | react-i18next / i18next | ^17.0.8 / ^26.3.1 |
| Charts | ECharts (SVG renderer, tree-shaken) | ^5.6.0 |
| Spreadsheet | SheetJS xlsx — **CDN tarball pin** (see note) | 0.20.3 |
| Slides | pptxgenjs | ^4.0.1 |
| Formatter / linter | Biome | ^2.0.0 |
| Test runner | Vitest | ^2.1.0 |

**SheetJS note:** `xlsx` is pinned to the CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) for supply-chain safety. Do **not** run `npm install xlsx` or replace this with the npm registry package.

---

## Quick start

```bash
npm install
npm run dev          # Vite dev server
npm run build        # tsc + Vite production build (runs supply-chain check first)
npm run test:run     # Vitest single run
npm run typecheck    # tsc --noEmit (app + test configs)
npm run lint         # Biome check
npm run lint:fix     # Biome check --write
```

Open `http://localhost:5173`, drop a Live Optics PPDM `.xlsx` export onto the upload zone, and use the flavor / language / theme toggles before exporting.

---

## Privacy guarantee

- A synchronous `fetchGuard` in `src/privacy/fetchGuard.ts` **throws** on any non-same-origin network request. No data can leave the browser silently.
- A CSP `<meta>` tag in `index.html` blocks third-party connections at the browser level.
- No dataset rows are persisted. Refreshing the page clears all loaded data.
- The only keys written to `localStorage` are `ppdm-report-theme` and `ppdm-report-lang`.

---

## Architecture

```
pure engines/  →  inputs-only Zustand store  →  one bridge hook  →  lean UI + exports
```

The Zustand store holds only the parsed workbook (`ParsedWorkbook`) and the report `flavor`; theme and language live in `useTheme` and i18next (persisted to `localStorage`). Every metric is derived on demand in `useReportView` via a single `useMemo` — no derived state is ever stored. `engines/` are pure functions with no React, DOM, or store dependencies.

```
src/
├── main.tsx                      # fetchGuard → i18n → App
├── privacy/fetchGuard.ts
├── engines/
│   ├── parser/                   # xlsx → typed rows (Zod boundary)
│   ├── aggregation/              # coverage, gaps, jobs, compliance, capacity, policies, agents
│   └── export/                   # PPTX (dual-theme) + HTML
├── store/reportStore.ts          # inputs-only Zustand
├── hooks/                        # useReportUpload, useReportView, useTheme, useExport
├── components/                   # Chart.tsx (only ECharts import), dashboard sections, controls
├── theme/echartsTheme.ts
├── i18n/                         # en / fr / de / it namespaces
├── types/                        # ppdm.ts, reportView.ts
└── utils/format.ts               # locale number / date / bytes (base-10)
```

Architecture mirrors the sibling project [vatlas](https://github.com/fjacquet/vatlas); patterns are copied, not shared via git history.

---

## Documentation

| Document | Location |
|---|---|
| Design spec (authoritative) | [`docs/superpowers/specs/2026-06-18-ppdm-report-design.md`](docs/superpowers/specs/2026-06-18-ppdm-report-design.md) |
| PRD | [`docs/PRD.md`](docs/PRD.md) |
| Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| User guide | [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md) |
| Architecture decision records | [`docs/adr/`](docs/adr/README.md) |

---

## Status

| Phase | Status |
|---|---|
| Plan 1 — Parser (xlsx → typed rows) | Complete |
| Plan 2 — Metric engines (aggregation) | Complete |
| Plan 3 — Dashboard + exports (PPTX / HTML) | Complete |

- **139 tests**, 0 failures, 0 skipped.
- Coverage gate: engines / utils / privacy must reach **≥ 75%** (enforced by the `test:coverage` threshold).
- Quality gates (run locally; ready to wire into CI): typecheck → lint → test → build → supply-chain check (xlsx CDN-pin verification + telemetry denylist).
