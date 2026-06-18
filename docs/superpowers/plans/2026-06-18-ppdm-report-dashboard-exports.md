# PPDM Report — Plan 3: Dashboard, Theme, i18n & Exports

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working engine layer into the *product*: a styled, scrollable dashboard with auto dark mode and fr/de/it/en, real drag-and-drop upload, and dual-theme PPTX + self-contained HTML export — matching the approved mockups.

**Architecture:** UI reads the derived `ReportView` via `useReportView` (Plan 2). Theme/i18n/Chart infra is adapted from vatlas. The dashboard is ONE scrollable view of sections; a flavor toggle reorders emphasis. Exports run in a worker: the PPTX builder picks its palette from the live resolved theme. No metric logic in the UI — it only renders `ReportView`.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4 (class dark mode), react-i18next, Apache ECharts 6 (SVG, tree-shaken), pptxgenjs 4, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-18-ppdm-report-design.md` (§6 flavors, §7 deck, §8 visual, §9 i18n/dark/privacy, §10 exports). **Builds on** Plans 1 & 2 (on `main`). **Reuse source:** vatlas at `/Users/fjacquet/Projects/vatlas`.

## Global Constraints

- **No metric logic in UI/exports** — components and slide builders read `ReportView` fields only; never recompute. (DRY/KISS/FP.)
- **Arial everywhere** — app, charts, PPTX, HTML (`font-family: Arial, Helvetica, sans-serif`; pptx font "Arial").
- **Auto dark mode** — `useTheme` resolves auto→system; `.dark` class on `<html>`; Tailwind `dark:` variants; only `ppdm-report-theme` / `ppdm-report-lang` persisted (privacy invariant).
- **PPTX follows the live web theme** — the export worker receives the resolved theme (`'light' | 'dark'`) and the matching palette; both themes implemented.
- **i18n** — en/fr/de/it; numbers/dates via `src/utils/format.ts` (base-10), never pre-formatted in strings; a key-parity test fails CI on any missing key.
- **No silent caps / honest** — Jobs & Compliance panels/slides print the capped-window caveat (`capped`/`windowSize`); lists render "top 25 of N" using the engine's `TopList`.
- **Skip empty, list idle** — no per-type slide/section for an idle agent; one "agents present, not in use" panel/slide lists `idleAgents`.
- **Quality first** — every task ends green: `npm run test:run`, `npm run typecheck`, biome via `rtk proxy node_modules/.bin/biome check .` (0 errors AND 0 warnings; use `?.` not `!` in tests), `npm run build`. Run `npm run test:coverage` on the final task. Engines/utils/privacy stay ≥75%; UI/export code is excluded from the coverage gate where it is render-only (add to `coverage.exclude` with a comment if it would otherwise drag the gate, never write vacuous tests).
- **ECharts bundle discipline** — import only the chart types/components used (BarChart, PieChart + Grid/Tooltip/Legend/Dataset) and the SVGRenderer; never the full `echarts` bundle.

## Visual language (locked from approved mockups)

Use these via Tailwind utilities (light / `dark:`) for components, and the explicit hex in `palette.ts` for ECharts/PPTX:

- Light: bg `white`, surface `slate-50`, ink `slate-900`, muted `slate-500`, line `slate-200`, accent `blue-600`, ok `green-600`, warn `amber-600`, bad `red-600`, excluded `slate-300`.
- Dark: bg `slate-950`(#0b1220-ish), surface `slate-900`, ink `slate-100`, muted `slate-400`, line `slate-800`, accent `blue-400`, ok `green-400`, warn `amber-400`, bad `red-400`, excluded `slate-700`.
- KPI cards: left accent border, big value, uppercase micro-label. Severity by metric (immutable 0% → bad/red). 16:9 slide grammar for PPTX.

## File Structure

```
src/index.css                                  # + @variant dark + Arial base
src/theme/palette.ts                           # shared light/dark hex tokens (ECharts + PPTX)
src/theme/echartsTheme.ts (+ .test.ts)         # MIDNIGHT_EXECUTIVE light/dark ECharts themes
src/hooks/useTheme.ts (+ .test.ts)             # auto/light/dark (reused from vatlas)
src/i18n/index.ts                              # react-i18next init
src/i18n/locales/{en,fr,de,it}/*.json          # common, dashboard, report, pptx namespaces
src/i18n/keyParity.test.ts                     # all keys present in all 4 locales
src/components/
├── Chart.tsx                                  # only ECharts import site (reused from vatlas)
├── KpiCard.tsx (+ .test.tsx)
├── ThemeToggle.tsx · LanguageToggle.tsx · FlavorToggle.tsx
├── UploadZone.tsx                             # drag-and-drop (replaces Plan-1 picker)
├── ExportButtons.tsx
└── dashboard/
    ├── Dashboard.tsx                          # scrollable sections, flavor-ordered
    ├── ExecutiveKpis.tsx · CoverageSection.tsx · GapsSection.tsx
    ├── IdleAgentsSection.tsx · JobsComplianceSection.tsx
    ├── CapacitySection.tsx · PoliciesSection.tsx
    └── sections.test.tsx                      # render tests over a fixture ReportView
src/store/reportStore.ts                       # + flavor field
src/engines/export/
├── buildExportModel.ts (+ .test.ts)           # ReportView → ordered, localized slide/section model
├── pptx/{theme.ts, primitives.ts, builder.ts} # dual-theme PPTX (pattern from vatlas)
├── html/assembleHtml.ts (+ .test.ts)          # self-contained HTML
├── export.worker.ts · types.ts
src/hooks/useExport.ts
```

---

## Task 1: Tailwind dark mode + useTheme hook

**Files:** `src/index.css` (modify), `src/hooks/useTheme.ts` + `.test.ts` (create), `src/components/ThemeToggle.tsx` (create)

**Interfaces:** Produces `useTheme(): { theme: 'auto'|'light'|'dark', resolved: 'light'|'dark', setTheme(t): void }`. Consumed by ThemeToggle, Chart, and useExport (Task 13).

- [ ] **Step 1:** Copy `/Users/fjacquet/Projects/vatlas/src/hooks/useTheme.ts` and its `.test.ts` → `src/hooks/`. Adapt: localStorage key → `ppdm-report-theme`; ensure it exports `theme` (the 3-state preference), `resolved` (`'light'|'dark'` after auto resolution), and `setTheme`. If the vatlas version differs in shape, adjust the test to match the adapted exports (keep real assertions: stores pref, toggles `.dark`, follows system on auto).
- [ ] **Step 2:** In `src/index.css`, after `@import 'tailwindcss';`, add class-based dark mode and keep Arial:

```css
@import 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));
:root { font-family: Arial, Helvetica, sans-serif; }
body { margin: 0; }
```

- [ ] **Step 3:** Create `src/components/ThemeToggle.tsx` — a button cycling auto→light→dark using `useTheme`, labelled via i18n later (for now plain text "Theme: {theme}"). Arial inherited.
- [ ] **Step 4:** Run `npx vitest run src/hooks/useTheme.test.ts` (PASS), `npm run test:run`, `npm run typecheck`, `rtk proxy node_modules/.bin/biome check .` (0/0).
- [ ] **Step 5:** `git add src/hooks/useTheme.ts src/hooks/useTheme.test.ts src/index.css src/components/ThemeToggle.tsx && git commit -m "feat: add auto dark-mode theme hook and toggle"`

---

## Task 2: ECharts theme + Chart wrapper

**Files:** `src/theme/palette.ts`, `src/theme/echartsTheme.ts` + `.test.ts`, `src/components/Chart.tsx` (create)

**Interfaces:** Produces `PALETTE` (light/dark hex sets), `MIDNIGHT_EXECUTIVE_LIGHT`/`_DARK` ECharts themes, and `<Chart option={...} dark={boolean} />`. Chart is the ONLY ECharts import site.

- [ ] **Step 1: Write** `src/theme/palette.ts` (sRGB hex — zrender/pptx cannot parse oklch):

```ts
export interface Palette {
  bg: string; surface: string; ink: string; muted: string; line: string
  accent: string; ok: string; warn: string; bad: string; excluded: string
  series: string[]
}
export const LIGHT: Palette = {
  bg: '#ffffff', surface: '#f8fafc', ink: '#0f172a', muted: '#64748b', line: '#e2e8f0',
  accent: '#2563eb', ok: '#16a34a', warn: '#d97706', bad: '#dc2626', excluded: '#cbd5e1',
  series: ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'],
}
export const DARK: Palette = {
  bg: '#0b1220', surface: '#111a2c', ink: '#e5e9f0', muted: '#94a3b8', line: '#1e293b',
  accent: '#3b82f6', ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444', excluded: '#334155',
  series: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#22d3ee'],
}
```

- [ ] **Step 2: Write the failing test** `src/theme/echartsTheme.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MIDNIGHT_EXECUTIVE_DARK, MIDNIGHT_EXECUTIVE_LIGHT } from './echartsTheme'

describe('echarts themes', () => {
  it('use Arial and sRGB hex (no oklch)', () => {
    for (const t of [MIDNIGHT_EXECUTIVE_LIGHT, MIDNIGHT_EXECUTIVE_DARK]) {
      expect(t.textStyle.fontFamily).toMatch(/Arial/)
      expect(JSON.stringify(t)).not.toContain('oklch')
    }
  })
  it('light and dark differ in background', () => {
    expect(MIDNIGHT_EXECUTIVE_LIGHT.backgroundColor).not.toBe(MIDNIGHT_EXECUTIVE_DARK.backgroundColor)
  })
})
```

- [ ] **Step 3:** Run → FAIL. Then write `src/theme/echartsTheme.ts` building two theme objects from `LIGHT`/`DARK` (`backgroundColor`, `textStyle.fontFamily: 'Arial, Helvetica, sans-serif'`, `color: series`, axis/legend/tooltip colors from palette). Run → PASS.
- [ ] **Step 4:** Create `src/components/Chart.tsx` — copy the pattern from `/Users/fjacquet/Projects/vatlas/src/components/Chart.tsx`, but register only what we use:

```ts
import { BarChart, PieChart } from 'echarts/charts'
import { DatasetComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
```

`echarts.use([...])`, `registerTheme('midnight-light', MIDNIGHT_EXECUTIVE_LIGHT)` and `'midnight-dark'`. Component props `{ option: EChartsOption; dark: boolean; style?; ariaLabel? }`; init/update an instance, pick theme by `dark`, dispose on unmount, `memo`.

- [ ] **Step 5:** `npm run test:run`, `npm run typecheck`, biome 0/0 (`rtk proxy`), `npm run build` (confirm ECharts is tree-shaken into its own chunk). Commit: `git add src/theme src/components/Chart.tsx && git commit -m "feat: add ECharts midnight theme (light/dark) and Chart wrapper"`

---

## Task 3: i18n (fr/de/it/en) + language toggle

**Files:** `src/i18n/index.ts`, `src/i18n/locales/{en,fr,de,it}/{common,dashboard,report,pptx}.json`, `src/i18n/keyParity.test.ts`, `src/components/LanguageToggle.tsx`, `src/main.tsx` (modify)

**Interfaces:** Initializes i18next (detection order querystring→localStorage `ppdm-report-lang`→navigator; fallback `en`). Produces translation keys for dashboard + export. LanguageToggle switches language.

- [ ] **Step 1:** Create `src/i18n/index.ts` — copy the init pattern from `/Users/fjacquet/Projects/vatlas/src/i18n/index.ts`; set `supportedLngs: ['en','fr','de','it']`, `fallbackLng: 'en'`, `lookupLocalStorage: 'ppdm-report-lang'`, namespaces `['common','dashboard','report','pptx']`, resources imported from the locale JSONs.
- [ ] **Step 2:** Author `src/i18n/locales/en/*.json` with the keys the dashboard + slides need. Minimum keys (add as components require them — keep names stable):
  - `common`: `appTitle`, `upload.drop`, `upload.choose`, `lang`, `theme`, `flavor.assessment`, `flavor.ops`, `capped` ("based on most recent {{n}} — a window, not the full set"), `topOf` ("top {{shown}} of {{total}}").
  - `dashboard`: `coverage.title`, `coverage.protected`, `coverage.unprotected`, `coverage.excluded`, `coverage.headline`, `coverage.inclExcluded`, `gaps.title`, `gaps.unprotectedTb`, `gaps.assets`, `idle.title`, `idle.subtitle`, `jobs.title`, `jobs.success`, `compliance.title`, `compliance.appConsistent`, `compliance.immutable`, `compliance.replicated`, `capacity.title`, `capacity.utilization`, `policies.title`, `kpi.coverage`, `kpi.unprotected`, `kpi.jobSuccess`, `kpi.immutable`.
  - `report`: title/section headings for HTML export. `pptx`: slide titles.
- [ ] **Step 3:** Create `fr/`, `de/`, `it/` with the SAME keys, translated (FR/DE/IT). Translate values; keep keys identical.
- [ ] **Step 4: Write** `src/i18n/keyParity.test.ts` — load all four locales' namespaces; assert every key path present in `en` exists in `fr`, `de`, `it` (and vice-versa). Real recursive key-set comparison.
- [ ] **Step 5:** Create `src/components/LanguageToggle.tsx` (select or button group over `i18n.changeLanguage`). Add `import './i18n'` to `src/main.tsx` (after fetchGuard, before App render) and wrap nothing else (react-i18next reads context via hooks).
- [ ] **Step 6:** `npx vitest run src/i18n/keyParity.test.ts` (PASS), full `npm run test:run`, typecheck, biome 0/0. Commit: `git add src/i18n src/components/LanguageToggle.tsx src/main.tsx && git commit -m "feat: add fr/de/it/en i18n with key-parity gate and language toggle"`

---

## Task 4: KPI card + Executive KPIs

**Files:** `src/components/KpiCard.tsx`, `src/components/dashboard/ExecutiveKpis.tsx`, `src/components/dashboard/sections.test.tsx` (create)

**Interfaces:** `KpiCard({ value, label, detail?, tone })` (tone ∈ 'accent'|'ok'|'warn'|'bad'|'muted'). `ExecutiveKpis({ view })` renders coverage / unprotected TB / job success / immutable KPIs from a `ReportView`.

- [ ] **Step 1: Write the failing test** in `src/components/dashboard/sections.test.tsx` — build a fixture `ReportView` (coverage.overall {protected:703,unprotected:281, pct:0.714,...}, gaps {totalCapacityGb: 263000, count:281}, jobs {successPct:0.93}, compliance {immutablePct:0}) and assert `ExecutiveKpis` renders "71%"/"71.4%" coverage, "263 TB" (formatted), "93%" job success, and a "0%" immutable card with the bad/red tone class. Use `@testing-library/react`, `?.` not `!`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write `KpiCard.tsx` (Tailwind: `border-l-4`, tone→border/text color via a class map with `dark:` variants; big value, uppercase label, small detail) and `ExecutiveKpis.tsx` (4 cards in a responsive grid, values via `src/utils/format.ts` — `formatPercent`, `formatBytes` for TB). Immutable card tone `bad` when `immutablePct === 0`.
- [ ] **Step 4:** Run → PASS; full suite, typecheck, biome 0/0.
- [ ] **Step 5:** `git add src/components/KpiCard.tsx src/components/dashboard/ExecutiveKpis.tsx src/components/dashboard/sections.test.tsx && git commit -m "feat: add KPI card and executive KPIs"`

---

## Task 5: Coverage section (donut + per-type bars)

**Files:** `src/components/dashboard/CoverageSection.tsx`; extend `sections.test.tsx`

**Interfaces:** `CoverageSection({ view, dark })` — overall donut (protected/unprotected/excluded) + per-type horizontal bars; shows headline pct and the "incl. excluded" secondary.

- [ ] **Step 1:** Add a failing test: `CoverageSection` with the fixture renders an element containing the per-type labels (e.g. "SQL Databases") and the legend counts (703 / 281 / 377). (Assert DOM text; chart canvas/svg need not be asserted beyond presence of an `aria-label`.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write `CoverageSection.tsx`: build ECharts `option` objects (pie for overall, bar for per-type from `view.coverage.byType`) using palette colors (ok/bad/excluded); pass to `<Chart dark={dark} ariaLabel=... />`. Render the headline `pct` and secondary `pctInclExcluded` as text via `formatPercent`. No metric math — read `view.coverage`.
- [ ] **Step 4:** Run → PASS; suite, typecheck, biome 0/0.
- [ ] **Step 5:** Commit `feat: add coverage section with donut and per-type bars`.

---

## Task 6: Gaps + idle-agents sections

**Files:** `src/components/dashboard/GapsSection.tsx`, `src/components/dashboard/IdleAgentsSection.tsx`; extend `sections.test.tsx`

**Interfaces:** `GapsSection({ view })` — total unprotected TB + count + a "top {shown} of {total}" table of `view.gaps.top.items`. `IdleAgentsSection({ view })` — lists `view.idleAgents` (the present-but-unused agents); renders nothing if empty.

- [ ] **Step 1:** Failing tests: GapsSection renders "263 TB", "281", the top-of-N caption (via `common:topOf`), and an unprotected asset name from the fixture; IdleAgentsSection lists a fixture idle agent ("Oracle Databases") and renders null for an empty `idleAgents`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write both. Gaps table columns: name / type / size (formatBytes GB→TB). Caption uses `t('common:topOf', { shown: view.gaps.top.shown, total: view.gaps.top.total })`. IdleAgents: chips/list of names + subtitle. `?.` where indexing.
- [ ] **Step 4:** Run → PASS; suite, typecheck, biome 0/0.
- [ ] **Step 5:** Commit `feat: add gaps and idle-agents sections`.

---

## Task 7: Jobs/compliance, capacity, policies sections

**Files:** `src/components/dashboard/JobsComplianceSection.tsx`, `CapacitySection.tsx`, `PoliciesSection.tsx`; extend `sections.test.tsx`

**Interfaces:** Render `view.jobs` (result mix + success% + capped caveat), `view.compliance` (appConsistent/immutable/replicated + level mix + capped caveat), `view.capacity` (targets + flagged), `view.policies` (count + byPurpose + perPolicy top rows).

- [ ] **Step 1:** Failing tests: JobsCompliance shows "93%" and the capped caveat text when `jobs.capped` (use `common:capped` with `windowSize`); the immutable figure "0%"; Capacity lists a flagged target name with a warn tone; Policies shows the count and a purpose tally.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write the three sections. Capped caveat rendered whenever `jobs.capped`/`compliance.capped`. Flagged targets get warn/bad tone. No recomputation.
- [ ] **Step 4:** Run → PASS; suite, typecheck, biome 0/0.
- [ ] **Step 5:** Commit `feat: add jobs/compliance, capacity, and policies sections`.

---

## Task 8: Dashboard shell + flavor toggle + wire App (VISIBLE milestone)

**Files:** `src/store/reportStore.ts` (modify: add `flavor`), `src/components/FlavorToggle.tsx`, `src/components/dashboard/Dashboard.tsx`, `src/App.tsx` (modify: replace DebugInventory), remove `src/components/DebugInventory.tsx`

**Interfaces:** Store gains `flavor: 'assessment'|'ops'` + `setFlavor`. `Dashboard({ view })` orders sections by flavor (assessment: coverage→gaps→per-type emphasis; ops: jobs/compliance→capacity first). App shows header (title, ThemeToggle, LanguageToggle, FlavorToggle, ExportButtons placeholder), UploadZone, and Dashboard when a view exists.

- [ ] **Step 1:** Failing test: store starts `flavor: 'assessment'`; `setFlavor('ops')` updates it. Add to `reportStore.test.ts`.
- [ ] **Step 2:** Run → FAIL. Add `flavor`/`setFlavor` to the store (inputs-only; default 'assessment'). Run → PASS.
- [ ] **Step 3:** Write `FlavorToggle.tsx` (two-option switch via store). Write `Dashboard.tsx` consuming `useReportView()` + `useTheme().resolved` for `dark`, rendering the sections in an order chosen by `useReportStore(s=>s.flavor)`. Header KPIs always first (ExecutiveKpis).
- [ ] **Step 4:** Rewrite `src/App.tsx`: header bar (Arial, Tailwind, dark-aware) with title + toggles; `<UploadZone/>`; `{view && <Dashboard view={view}/>}`. Delete `DebugInventory.tsx` and its import. Update `App.test.tsx` if it asserted debug content — keep a real assertion (e.g. the app title renders).
- [ ] **Step 5:** Run full suite, typecheck, biome 0/0, `npm run build`.
- [ ] **Step 6: Manual visual check (controller will run):** `npm run dev`, drop `ref/PPDM.xlsx`, confirm the styled dashboard renders with KPIs/coverage/gaps/etc., dark mode toggles, language switches. (Implementer: report that build succeeds; the controller performs the browser check.)
- [ ] **Step 7:** `git add -A` (verify no node_modules/ref) `&& git commit -m "feat: styled dashboard with flavor toggle; replace debug view"`

---

## Task 9: Drag-and-drop UploadZone

**Files:** `src/components/UploadZone.tsx` (rewrite)

**Interfaces:** Adds real drag-and-drop (`onDragOver`/`onDragLeave`/`onDrop`) plus the existing file-picker, with a visible drag-active state. Honest copy ("Drop or choose a Live Optics PPDM .xlsx"), i18n'd. Same `useReportUpload` flow.

- [ ] **Step 1:** Write a test: simulate a `drop` event with a `.xlsx` File in `dataTransfer.files`; assert `upload` is invoked (mock `useReportUpload` or assert the file reaches the handler). Drag-over toggles an active class.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Rewrite `UploadZone.tsx` with drag handlers (preventDefault on dragover/drop), a `dragActive` state for styling, accept only `.xlsx`, call `upload(file)`; busy/error states; Arial; i18n labels.
- [ ] **Step 4:** Run → PASS; suite, typecheck, biome 0/0.
- [ ] **Step 5:** Commit `feat: add drag-and-drop upload`.

---

## Task 10: PPTX theme + primitives

**Files:** `src/engines/export/pptx/theme.ts`, `src/engines/export/pptx/primitives.ts`, `src/engines/export/types.ts`

**Interfaces:** `PPTX_LIGHT`/`PPTX_DARK` (palette + fonts) selected by resolved theme. Primitives: `kpiCard(slide, ...)`, `progressBar(...)`, `tableBlock(...)`, layout constants — adapted from `/Users/fjacquet/Projects/vatlas/src/engines/export/pptx/primitives/`. `types.ts`: `ExportRequest { model, theme, locale, strings }`, `ExportResponse`.

- [ ] **Step 1:** Read vatlas `src/engines/export/pptx/{theme.ts,primitives/}` for the pattern. Create `theme.ts` deriving PPTX palettes from `src/theme/palette.ts` (LIGHT/DARK) with Arial font; create `primitives.ts` with `kpiCard`/`progressBar`/`tableBlock`/layout helpers (16:9, 13.333×7.5in). Pure functions taking a pptxgenjs slide + data.
- [ ] **Step 2:** Write a unit test asserting `PPTX_LIGHT.bg !== PPTX_DARK.bg` and both fonts are 'Arial'. Run → PASS.
- [ ] **Step 3:** Typecheck + biome 0/0. Commit `feat: add dual-theme PPTX theme and slide primitives`.

---

## Task 11: Export model + PPTX builder (flavor-ordered, skip idle, top-25, caveats)

**Files:** `src/engines/export/buildExportModel.ts` + `.test.ts`, `src/engines/export/pptx/builder.ts`

**Interfaces:** `buildExportModel(view, flavor): ExportModel` — pure: orders slides by flavor, includes ONE per-type slide per `inUse` type, ONE idle-agents slide (if any), and the jobs/compliance/capacity/policies/appendix slides; carries capped caveats and top-25 lists. `buildPptx(model, theme, strings): Promise<ArrayBuffer>` — emits slides via primitives.

- [ ] **Step 1: Write the failing test** for `buildExportModel`: with a fixture view (inUse `['SQL Databases','Virtual Machines']`, idleAgents `['Oracle Databases']`, jobs.capped true), assert the model's slide list: includes exactly 2 per-type slides (one per inUse), exactly 1 idle-agents slide, the jobs slide carries `capped:true`/`windowSize`, and assessment-flavor orders coverage/gaps before jobs while ops orders jobs/compliance/capacity first. NO per-type slide for the idle agent.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write `buildExportModel.ts` (pure ordering/selection over `ReportView`). Then write `builder.ts` using pptxgenjs + primitives to emit each slide kind from the model and the theme palette; return `write({ outputType: 'arraybuffer' })`. (Builder itself is exercised via the worker E2E in Task 13; the model is unit-tested here.)
- [ ] **Step 4:** Run model test → PASS; suite, typecheck, biome 0/0.
- [ ] **Step 5:** Commit `feat: add export model and dual-theme PPTX builder`.

---

## Task 12: HTML export

**Files:** `src/engines/export/html/assembleHtml.ts` + `.test.ts`

**Interfaces:** `assembleHtml(model, theme, strings): string` — a self-contained HTML doc (inline CSS, CSP meta, no JS, Arial), theme-matched, rendering the same sections as the dashboard from the export model.

- [ ] **Step 1: Write the failing test:** `assembleHtml(model,'light',strings)` returns a string starting `<!doctype html>`, containing a CSP `<meta>`, the customer name, the coverage headline, the "top 25 of N" gaps caption, and the capped caveat; and `'dark'` produces a different `<body>` background. No `<script>` tags.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write `assembleHtml.ts` — string-assemble doctype + `<style>` (palette by theme, Arial) + `<body>` sections from the model. CSP meta blocks third-party. Escape user text.
- [ ] **Step 4:** Run → PASS; suite, typecheck, biome 0/0.
- [ ] **Step 5:** Commit `feat: add self-contained HTML export`.

---

## Task 13: Export worker + useExport + ExportButtons (wire it up; FULL gate)

**Files:** `src/engines/export/export.worker.ts`, `src/hooks/useExport.ts`, `src/components/ExportButtons.tsx`, wire into `App.tsx`

**Interfaces:** Worker receives `ExportRequest { model, theme, locale, strings, kind }` → returns the PPTX `ArrayBuffer` or HTML string. `useExport()` resolves the live `ReportView`, `flavor`, resolved `theme`, locale + flattened `report`/`pptx` strings on the MAIN thread, posts to the worker, downloads the blob. `ExportButtons` renders PPTX + HTML buttons with busy state.

- [ ] **Step 1:** Write `export.worker.ts` (imports fetchGuard first; builds pptx via `buildPptx` or html via `assembleHtml` from the posted model+theme). Write `types.ts` request/response (if not already). Write `useExport.ts` — gather inputs main-thread (Pitfall: never read store in worker), filename `ppdm-report_<customer>_<ISO>.<ext>`, trigger download. Write `ExportButtons.tsx`.
- [ ] **Step 2:** Wire `<ExportButtons/>` into the App header (enabled only when a view exists). `npm run typecheck`.
- [ ] **Step 3: FULL gate:** `npm run test:run`, `npm run typecheck`, `rtk proxy node_modules/.bin/biome check .` (0/0), `npm run build`, `npm run test:coverage` (engines/utils/privacy ≥75% — if UI/export render files would drag it, add them to `coverage.exclude` with a comment; the metric engines from Plan 2 keep the gate honest).
- [ ] **Step 4: Manual E2E (controller will run):** dev server, drop `ref/PPDM.xlsx`, export PPTX (light AND dark) + HTML, confirm files open and match the theme.
- [ ] **Step 5:** `git add -A` (verify clean) `&& git commit -m "feat: wire dual-theme PPTX + HTML export end-to-end"`

---

## Self-Review (completed by author)

- **Spec coverage:** auto dark mode ✓ T1/T2; i18n fr/de/it/en + parity ✓ T3; styled dashboard sections (all metrics, skip-idle, top-25, capped caveats) ✓ T4–T8; drag-drop ✓ T9; dual-theme PPTX following web theme ✓ T10/T11/T13; HTML ✓ T12; flavor ordering ✓ T8/T11; Arial ✓ throughout; privacy keys ✓ T1/T3.
- **No metric logic in UI/exports:** every section/slide reads `ReportView`; `buildExportModel` only orders/selects. DRY holds.
- **Placeholder scan:** infra tasks are "copy from vatlas + adapt" with exact paths; PPDM-specific UI/model/HTML have full code or precise component specs + real tests. No "TBD".
- **Type consistency:** `ReportView` (Plan 2) consumed read-only; `ExportRequest/Response` and `ExportModel` defined in types and used by worker/hook/builder/html consistently.

## Process notes

- Run biome via `rtk proxy node_modules/.bin/biome check .`; tests use `?.` not `!`.
- The controller performs the two manual browser checks (Task 8, Task 13).
- Recommended (from P2 review): add a real-file integration test asserting spec numbers — fold into Task 8 or a follow-up if cheap.

```
