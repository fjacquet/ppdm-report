# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 100% client-side React/TypeScript app: drop a Dell Live Optics PPDM `.xlsx` export, get an interactive dashboard plus one-click PPTX and HTML export. The workbook is parsed in the browser and never leaves it. See `README.md` for the feature list and `docs/` for the authoritative design spec, PRD, ARCHITECTURE, and ADRs.

## Commands

```bash
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # tsc -b + vite build; prebuild runs the supply-chain gate
npm run typecheck        # tsc --noEmit for BOTH app and test configs — run after type changes
npm run lint             # biome check .
npm run lint:fix         # biome check --write .
npm run test             # vitest watch
npm run test:run         # vitest single run
npm run test:coverage    # single run + v8 coverage gate (≥75% on engines/utils/privacy)
npm run check:supply-chain   # the supply-chain gate, standalone
npm run pptx -- <file.xlsx>  # headless CLI — generate PPTX locally without the browser
```

Run a single test file or test by name:

```bash
npx vitest run src/engines/aggregation/coverage.test.ts
npx vitest run -t "coverage"        # filter by test name substring
```

CI (`.github/workflows/ci.yml`) runs, in order: typecheck → lint → test:run → build (build triggers the supply-chain gate via `prebuild`). Match that sequence before claiming work is done.

## Headless CLI

`npm run pptx -- <file.xlsx>` (or `ppdm-report-pptx <file>` via the bin) generates the same PPTX deck as the browser export without opening a browser.

Flags: `--out <path>`, `--lang <code>`, `--theme light|dark`, `--flavor assessment|ops`, `--quiet`.
Defaults: theme `light`, flavor `assessment`, language `en`. Output: `<basename>_ppdm-report.pptx` beside the input.

Engine pipeline (identical to the app's export path):

1. `ingestReport` (`src/engines/ingestReport.ts`) — parses the workbook into an `EstateDocument`; the CLI reads `doc.products[0].estate`.
2. `buildExportModel` — builds the theme- and flavor-aware `ExportModel`.
3. `buildPptx(model, theme)` — assembles the deck.

Run via `tsx`; the CLI entry point is excluded from the Vite app bundle and type-checked via `tsconfig.node.json`.

**No-network invariant:** the CLI makes zero network calls and upholds the repo's in-browser / no-exfiltration guarantee. All processing is local.

---

## Architecture: the one data flow

```
File → worker → RawWorkbook → detectProduct → ServerWorkbook (tagged) → Zustand store (inputs only)
  → useReportView (single useMemo) → buildEstateDocument
      → getViewBuilder(product) per group → ViewBuilder (buildPpdmView | buildAvamarView | buildNetworkerView) → ReportView
      → mergeViews (per product group) → EstateDocument → ProductSection UI + exports
```

Hard rules that the whole design depends on — do not violate them:

- **`engines/` are pure.** No React, no DOM, no store imports, no `Date.now()`-style nondeterminism. Parser (`xlsx → RawWorkbook`, Zod boundary), product adapters (`engines/products/`), aggregation (coverage/gaps/jobs/compliance/capacity/policies), and export (PPTX/HTML) all take data in and return data out. They are the only place with unit-test coverage requirements.
- **The store holds inputs only** (`src/store/reportStore.ts`): the array of `ServerWorkbook` (each tagged with `product: ProductId` and containing a `RawWorkbook`) and the `flavor`. No derived metric is ever stored. Theme and language live outside the store (`useTheme` + i18next, persisted to `localStorage`).
- **One derivation point** (`src/hooks/useReportView.ts`): a single `useMemo` turns stored servers into an `EstateDocument` via `buildEstateDocument`. Everything the UI and exports render flows from here. Add new PPDM metrics to `buildPpdmView` (`src/engines/products/ppdm/buildPpdmView.ts`), not into components or the store.
- **Product-adapter registry** (`src/engines/products/index.ts`): `getViewBuilder(product)` returns the `ViewBuilder` for a `ProductId`; `isSupportedProduct` is the boolean shorthand. Three builders are registered: `ppdm → buildPpdmView`, `avamar → buildAvamarView`, and `networker → buildNetworkerView`. All three detected products have adapters; no product is "phase N pending".
  - **Avamar shape**: meta from the generic `Details` sheet (`baseTen: false` — base-2 byte values); coverage is count-based (clients with/without backups; retired clients → excluded band), no per-type breakdown (`coverageByType` stays unavailable — not honestly computable); jobs derive from `Avamar DPN Summary` detail rows (SUCCESS / EXCEPTION / FAILED), success rate excludes exception + failed, with `Backup Completion Summary` as fallback; workload types from `Job List Detailed` `Policy Type` (GC + No Plug-in excluded) with `Backup Plugins` fallback; idle list = disabled groups; policies from `Job List Detailed` `Group Name` (per-group hosts + capacity) with `Group Summary` fallback; gaps = unprotected-client list with **no per-asset size** (`UnprotectedAsset.sizeGb` is `undefined`); capacity = Avamar grid node utilization (latest reading per node), no Data Domain mtrees; front-end volumetry from `Client Capacity` (per-Application peak GiB, base-2); replication resilience from `Replication (Completion Status)` — app-consistency and immutability are N/A → 0% (NetWorker precedent); ops insights (agent versions, at-risk clients, longest backups) via `ReportView.opsInsights`. Provenance marks `coverageByType` unavailable; `compliance`, `frontEnd`, `gapsList`, and `storageTargets` available.
  - **NetWorker MVP shape**: meta from the generic `Details` sheet (`baseTen: true` — base-10 byte values, same as PPDM; `captureMeta` was extended to also recognise `Disclaimer #1`/`#2`-style numbered keys so NetWorker's disclaimer drives the `baseTen` flag); coverage is count-based from the `Clients` sheet `Scheduled Backup` flag (`True` = protected), no per-type breakdown; jobs use `Jobs` sheet `Completion Status` distribution with NetWorker-native bucket `Succeeded` (success rate = Succeeded / total); gaps = unprotected-client list (no `Scheduled Backup`), **no per-asset size** (`sizeGb: undefined`); capacity = real Data Domain utilization (`Data Domains` Used/Total, flagged at ≥ 80%) + distinct-mtree count from `Dedup Jobs`; workload types = `Front End Capacity by Workload` rows where capacity > 0 (`inUse`) vs = 0 (`idleAgents`), mirroring the PPDM agent in-use/idle split; policies = distinct protection-policy count from the `Policies` sheet; compliance is **computed** (not N/A): immutability from `Devices Detailed` `DD Retention Lock Mode` (≠ None), replication from `Backups` `Clone Status`, backup-level mix; **app-consistency is N/A → renders 0%**. Provenance marks `coverageByType` unavailable; `gapsList`, `compliance`, and `storageTargets` available.
- **Gaps size-optional contract**: `UnprotectedAsset.sizeGb?: number` and `Gaps.totalCapacityGb?: number` are optional. When absent (as in Avamar), the UI and exports render "size unknown" via `formatGbOrUnknown`. Other products that carry sizes are unaffected.
- **Parse output is product-neutral.** `normalizeWorkbook` emits `RawWorkbook = { meta, sheets, warnings }`. PPDM-specific logic (agent classification via `classifyAgents`) lives in `buildPpdmView`, not in the parser.
- **Two report flavors** (`assessment` / `ops`) share one metric engine; only slide order and KPI emphasis differ. Never fork the engine per flavor.
- **Front-end volumetry** (`engines/aggregation/frontEnd.ts` → `ReportView.frontEnd`): per-workload-type front-end TB (discovered + FETB) split protected/unprotected, rendered table-first via a `planSlides` full-width special-case. Totals derived at render; sizes are size-optional ("–" when no figure).

### Detail vs summary format

`detectFormat` (`src/engines/parser/detectFormat.ts`) classifies each workbook. Current Live Optics exports are **detail** (per-asset rows); older releases are **summary** (pre-aggregated `... Count And Cap` / `... Assets & Cap` sheets + a `System Configuration` sheet, no per-asset rows). `buildPpdmView` branches to `summaryView` for summary workbooks. Detail-only metrics (per-type coverage, the unprotected-asset list, copy compliance, storage-target utilization) are not recoverable from summary exports — they are marked unavailable, never faked.

### Provenance, not silent omission

Every metric carries a `MetricProvenance` (`available`, `serversCovered`, `serversTotal`, and for compliance `assetsCovered`/`assetsTotal`) — see `src/engines/aggregation/provenance.ts`. When a metric can't be computed (summary format, or mixed estate where only some servers contribute), surface it as "not available" with a coverage note. Never hide a number that exists, and never invent one that doesn't.

### Two merge layers — don't confuse them

- `mergeViews` (`src/engines/aggregation/mergeViews.ts`) — view-level: folds per-server `ReportView`s into the combined estate view. This is the path `useReportView` uses.
- `mergeWorkbooks` (`src/engines/parser/mergeWorkbooks.ts`) — workbook-level fold. Both must keep single-source input as an identity (one server → that server's data unchanged).

### Capped windows

Live Optics caps row-bearing sheets at `LIVE_OPTICS_ROW_CAP` (10,000). When a sheet is capped, `normalizeWorkbook` pushes a warning and the affected figures (jobs, compliance) are a recent window, not the full set — the caveat must stay attached to those numbers.

## Invariants you must not break

- **Privacy.** `src/privacy/fetchGuard.ts` throws synchronously on any non-same-origin request and is imported first in `main.tsx` and in the parser worker. A CSP `<meta>` in `index.html` enforces it at the browser level. No dataset rows are persisted; only `ppdm-report-theme` and `ppdm-report-lang` go to `localStorage`.
- **SheetJS pin.** `xlsx` is pinned to the official CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). Never `npm install xlsx` or swap to the npm-registry package (frozen at 0.18.5, carries CVE-2023-30533 + CVE-2024-22363). The supply-chain gate (`scripts/check-supply-chain.mjs`) enforces the pin, a telemetry-SDK denylist (no Sentry/PostHog/Amplitude/Datadog/etc.), and a service-worker allowlist (only `vite-plugin-pwa` + `workbox-*`). Adding any of those deps fails `build`.
- **i18n parity.** Four locales (en/fr/de/it). `src/i18n/keyParity.test.ts` fails CI on any missing translation key. When you add a UI/export string, add the key to all four namespaces.
- **One ECharts import.** Charts go through `src/components/Chart.tsx` (the only ECharts import, SVG renderer, tree-shaken). Build chart options as data in `engines`/`*Option.ts` helpers, render through `Chart`.
- **Base-10 byte formatting (default).** `src/utils/format.ts` does locale-aware number/date/bytes. Default is base-10 (PPDM/NetWorker Live Optics convention); pass `baseTen = false` (opt-in) to `formatBytes`, `gbToBytes`, and `formatGbOrUnknown` for base-2 GiB/TiB labels — Avamar uses base-2 byte values (`meta.baseTen === false`). All existing call sites omit the flag and continue to behave as before.

## Conventions

- **Biome** is the formatter and linter: single quotes, no semicolons, 2-space indent, 100-col width. `noUnusedImports`/`noUnusedVariables` are errors; `console` is an error except `warn`/`error` (relaxed in tests + scripts). `docs/` and `src/index.css` are excluded.
- **Tests use synthetic in-memory workbooks.** Build fixtures with `makeWorkbook(...)` from `src/test-helpers/workbooks.ts` (a `sheetName → Cell[][]` map → `.xlsx` ArrayBuffer). The real customer `.xlsx` fixtures under `ref/` are gitignored and absent in CI — never write a test that reads from `ref/` (it ENOENTs in CI).
- The browser/worker glue (`parser.worker.ts`, `parseInWorker.ts`) is excluded from coverage — it's verified end-to-end, not unit-tested. New pure logic belongs in a coverable engine module.
- Tailwind v4, class-based dark mode; theme follows `prefers-color-scheme` with a persisted override. PPTX/HTML exports follow the live theme and language.
