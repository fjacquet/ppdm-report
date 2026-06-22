# Deeper Deck Insights — Phase P0 (Quick Wins + Context Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PPTX/HTML deck less "high-level" by (a) coloring every value to a centralized threshold and adding plain-language takeaways, (b) actually rendering the per-section tables that are built today but never drawn, and (c) enriching the policy/compliance/capacity tables with already-computed data — without parsing any new source columns except storage used/total.

**Architecture:** The pure pipeline is unchanged (`ReportView → buildExportModel → ExportModel → buildPptx / assembleHtml`). All tone decisions move into one pure module `thresholds.ts` (value → `ExportTone`); `tone.ts` keeps only `toneHex` (tone → palette hex). The existing `ExportSection.table` field (currently serialized but never rendered) becomes the table contract: HTML renders it inline; PPTX renders it as a full-width **appendix** slide appended after the graphical band deck. Section ids `gaps`/`compliance` are renamed to `exposure`/`resilience` to match the new framing.

**Tech Stack:** TypeScript (strict), Vitest, Biome, pptxgenjs, i18next (en/fr/de/it), Vite.

## Global Constraints

(Every task's requirements implicitly include this section.)

- **Pure engines:** no React/DOM/store imports, no `Date.now()`/nondeterminism in `src/engines/**`.
- **i18n parity:** every new UI/export string key MUST exist in all four locales `src/i18n/locales/{en,fr,de,it}/dashboard.json` (or `common.json`); `src/i18n/keyParity.test.ts` fails CI otherwise.
- **Engine coverage gate:** `npm run test:coverage` must stay ≥ 75% on engines/utils/privacy.
- **CI order:** `npm run typecheck` → `npm run lint` → `npm run test:run` → `npm run build` must all pass before the phase is done.
- **Biome style:** single quotes, no semicolons, 2-space indent, 100-col width; `noUnusedImports`/`noUnusedVariables` are errors; `console` is an error (except `warn`/`error`).
- **Fonts:** PPTX/HTML use `Arial` (already wired via `FONT`/CSS — do not change).
- **No new source parsing** in P0 except `Total Used (GB)` / `Total Size (GB)` on the already-read `Storage Targets` sheet.
- **Tests use synthetic `makeWorkbook` fixtures** (`src/test-helpers/workbooks.ts`); never read `ref/` (CI ENOENT).
- **Palette hexes (light/dark)** used in test assertions: `ok` `#16a34a`/`#22c55e`, `warn` `#d97706`/`#f59e0b`, `bad` `#dc2626`/`#ef4444`, `excluded` `#cbd5e1`, `accent` `#2563eb`/`#3b82f6`. Verify exact values in `src/theme/palette.ts` before asserting.

---

## Pre-flight (one-time, before Task 1)

- [ ] **Confirm palette hexes** so test assertions match reality.

Run: `grep -nE "ok:|warn:|bad:|accent:|excluded:|muted:" src/theme/palette.ts`
Expected: prints the hex for each tone in `LIGHT` and `DARK`. Use these exact values in every color assertion below; if any differ from the Global Constraints list, use the file's values.

---

## Task 1: Centralized threshold→tone module

**Files:**
- Create: `src/engines/export/thresholds.ts`
- Create: `src/engines/export/thresholds.test.ts`
- Modify: `src/engines/export/tone.ts` (remove `immutableTone`; keep `toneHex`)

**Interfaces:**
- Produces: `coverageTone(pct0to1) → ExportTone`, `jobSuccessTone(pct0to1)`, `immutableTone(pct0to1)`, `replicatedTone(pct0to1)`, `appConsistentTone(pct0to1)`, `utilizationTone(pct0to100)` — all return `ExportTone`.
- Consumes: `ExportTone` from `./types`.

- [ ] **Step 1: Write the failing test**

Create `src/engines/export/thresholds.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  appConsistentTone,
  coverageTone,
  immutableTone,
  jobSuccessTone,
  replicatedTone,
  utilizationTone,
} from './thresholds'

describe('thresholds', () => {
  it('coverageTone: ≥0.95 ok, ≥0.80 warn, else bad', () => {
    expect(coverageTone(0.96)).toBe('ok')
    expect(coverageTone(0.95)).toBe('ok')
    expect(coverageTone(0.85)).toBe('warn')
    expect(coverageTone(0.8)).toBe('warn')
    expect(coverageTone(0.79)).toBe('bad')
  })

  it('jobSuccessTone: ≥0.98 ok, ≥0.90 warn, else bad', () => {
    expect(jobSuccessTone(0.99)).toBe('ok')
    expect(jobSuccessTone(0.93)).toBe('warn')
    expect(jobSuccessTone(0.89)).toBe('bad')
  })

  it('immutableTone: ≥0.80 ok, ≥0.30 warn, 0 bad', () => {
    expect(immutableTone(0.9)).toBe('ok')
    expect(immutableTone(0.5)).toBe('warn')
    expect(immutableTone(0)).toBe('bad')
  })

  it('replicatedTone / appConsistentTone: ≥0.80 ok, ≥0.50 warn, else bad', () => {
    expect(replicatedTone(0.8)).toBe('ok')
    expect(replicatedTone(0.6)).toBe('warn')
    expect(replicatedTone(0.32)).toBe('bad')
    expect(appConsistentTone(0.77)).toBe('warn')
  })

  it('utilizationTone takes 0..100: <70 ok, 70–85 warn, ≥85 bad', () => {
    expect(utilizationTone(40)).toBe('ok')
    expect(utilizationTone(75)).toBe('warn')
    expect(utilizationTone(87.6)).toBe('bad')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engines/export/thresholds.test.ts`
Expected: FAIL — "Failed to resolve import './thresholds'".

- [ ] **Step 3: Create the implementation**

Create `src/engines/export/thresholds.ts`:

```ts
import type { ExportTone } from './types'

/**
 * Value → tone bands — the single source of truth for "what color is this number?"
 * (the CTO test). All *Pct inputs are 0..1 ratios EXCEPT utilizationTone (0..100).
 */
export function coverageTone(pct: number): ExportTone {
  if (pct >= 0.95) return 'ok'
  if (pct >= 0.8) return 'warn'
  return 'bad'
}

export function jobSuccessTone(pct: number): ExportTone {
  if (pct >= 0.98) return 'ok'
  if (pct >= 0.9) return 'warn'
  return 'bad'
}

export function immutableTone(pct: number): ExportTone {
  if (pct >= 0.8) return 'ok'
  if (pct >= 0.3) return 'warn'
  return 'bad'
}

export function replicatedTone(pct: number): ExportTone {
  if (pct >= 0.8) return 'ok'
  if (pct >= 0.5) return 'warn'
  return 'bad'
}

export function appConsistentTone(pct: number): ExportTone {
  if (pct >= 0.8) return 'ok'
  if (pct >= 0.5) return 'warn'
  return 'bad'
}

/** Data Domain utilization, expressed 0..100. */
export function utilizationTone(pct: number): ExportTone {
  if (pct >= 85) return 'bad'
  if (pct >= 70) return 'warn'
  return 'ok'
}
```

- [ ] **Step 4: Remove the old `immutableTone` from `tone.ts`**

Edit `src/engines/export/tone.ts` — delete lines 20-23 (the `immutableTone` function and its comment), leaving only the `toneHex` function and imports.

- [ ] **Step 5: Run the thresholds test (pass) and typecheck (catches the moved symbol)**

Run: `npx vitest run src/engines/export/thresholds.test.ts && npm run typecheck`
Expected: thresholds test PASS; typecheck FAILS in `buildExportModel.ts` ("immutableTone is not exported from './tone'") — that import is fixed in Task 3. This is expected at this step.

- [ ] **Step 6: Commit**

```bash
git add src/engines/export/thresholds.ts src/engines/export/thresholds.test.ts src/engines/export/tone.ts
git commit -m "feat(export): centralized threshold→tone module"
```

---

## Task 2: Rename section ids `gaps→exposure`, `compliance→resilience`

This is a mechanical rename landed early so later tasks use the final ids. Titles change to the new framing; content is enriched in later phases.

**Files:**
- Modify: `src/engines/export/sectionOrder.ts`
- Modify: `src/engines/export/buildExportModel.ts` (section objects + i18n keys + `byId` map)
- Modify: `src/i18n/locales/{en,fr,de,it}/dashboard.json` (rename `gaps`→`exposure`, `compliance`→`resilience`; new titles)
- Modify: `src/engines/export/buildExportModel.test.ts` (id + title assertions)
- Modify: `src/engines/export/pptx/slidePlan.test.ts` (id strings)

**Interfaces:**
- Produces: `SectionId` union now contains `'exposure'` and `'resilience'` (not `'gaps'`/`'compliance'`).

- [ ] **Step 1: Update the failing tests first (they encode the new ids)**

In `src/engines/export/buildExportModel.test.ts`:
- Replace the `orders sections by flavor` expectation array (lines 89-97) `'gaps'`→`'exposure'`, `'compliance'`→`'resilience'`; line 99 `['jobs', 'compliance', 'capacity']`→`['jobs', 'resilience', 'capacity']`.
- Every `s.id === 'gaps'` → `s.id === 'exposure'`; every `s.id === 'compliance'` → `s.id === 'resilience'` (lines 115, 124-125, 287, 306, 314-316).

In `src/engines/export/pptx/slidePlan.test.ts`:
- Replace `'gaps'`→`'exposure'` and `'compliance'`→`'resilience'` in the id arrays and expectation strings (lines 10, 17-20, 25, 31-34, 40-42, 47).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts src/engines/export/pptx/slidePlan.test.ts`
Expected: FAIL — sections still emit ids `gaps`/`compliance`.

- [ ] **Step 3: Rename in `sectionOrder.ts`**

Edit `src/engines/export/sectionOrder.ts` — in the `SectionId` union replace `| 'gaps'`→`| 'exposure'` and `| 'compliance'`→`| 'resilience'`; in `SECTION_ORDER.assessment` replace `'gaps'`→`'exposure'` and `'compliance'`→`'resilience'`; same in `SECTION_ORDER.ops`.

- [ ] **Step 4: Rename in `buildExportModel.ts`**

Edit `src/engines/export/buildExportModel.ts`:
- `gapsSection.id`: `'gaps'` → `'exposure'` (line 200).
- `complianceSection.id`: `'compliance'` → `'resilience'` (line 315).
- i18n keys: `dashboard:gaps.*` → `dashboard:exposure.*` (lines 193, 197, 201) and `dashboard:compliance.*` → `dashboard:resilience.*` (lines 316, 319, 324, 329, 344, 349, 355).
- `byId` map keys (lines 442, 445): `gaps:` → `exposure:`, `compliance:` → `resilience:`.

- [ ] **Step 5: Rename the i18n blocks in all four locales**

In each of `src/i18n/locales/{en,fr,de,it}/dashboard.json`, rename the top-level `"gaps"` object key to `"exposure"` and `"compliance"` to `"resilience"`, and update the `title` strings:

- en: `exposure.title` = `"Recovery exposure"`, `resilience.title` = `"Cyber-resilience"`
- fr: `exposure.title` = `"Exposition de récupération"`, `resilience.title` = `"Cyber-résilience"`
- de: `exposure.title` = `"Wiederherstellungsrisiko"`, `resilience.title` = `"Cyber-Resilienz"`
- it: `exposure.title` = `"Esposizione al ripristino"`, `resilience.title` = `"Cyber-resilienza"`

(Keep the existing sub-keys `unprotectedTb`/`assets` under `exposure`, and `appConsistent`/`immutable`/`replicated` under `resilience`, unchanged.)

- [ ] **Step 6: Run tests + parity**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts src/engines/export/pptx/slidePlan.test.ts src/i18n/keyParity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engines/export/sectionOrder.ts src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/engines/export/pptx/slidePlan.test.ts src/i18n/locales
git commit -m "refactor(export): rename sections gaps→exposure, compliance→resilience"
```

---

## Task 3: Drive every tone from `thresholds.ts`

**Files:**
- Modify: `src/engines/export/buildExportModel.ts` (imports + exec KPIs + coverage/resilience/capacity bars)
- Modify: `src/engines/export/buildExportModel.test.ts` (capacity bar color assertion)

**Interfaces:**
- Consumes: Task 1 tone functions.

- [ ] **Step 1: Update the failing assertion (87.6% DD is now red, not amber)**

In `src/engines/export/buildExportModel.test.ts` line 189, change:

```ts
    expect(byId.capacity?.deck?.bars?.[0]).toMatchObject({ label: 'dd1', color: '#d97706' })
```

to (87.6 ≥ 85 ⇒ `bad`):

```ts
    expect(byId.capacity?.deck?.bars?.[0]).toMatchObject({ label: 'dd1', color: '#dc2626' })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts -t "builds a deck for every section"`
Expected: FAIL — bar color is still `#d97706` (flagged⇒warn) not `#dc2626`.

- [ ] **Step 3: Swap imports**

Edit `src/engines/export/buildExportModel.ts`:
- Line 14: change `import { immutableTone, toneHex } from './tone'` → `import { toneHex } from './tone'`.
- Add after it: `import { appConsistentTone, coverageTone, immutableTone, jobSuccessTone, replicatedTone, utilizationTone } from './thresholds'`.

- [ ] **Step 4: Apply tones**

In `src/engines/export/buildExportModel.ts`:
- Exec KPI coverage (line 104) `tone: 'ok' as const` → `tone: coverageTone(coverage.overall.pct)`.
- Exec KPI jobSuccess (line 113) `tone: 'ok' as const` → `tone: jobSuccessTone(jobs.successPct)`.
- (Exec immutable already uses `immutableTone` — now resolves to the thresholds version.)
- Coverage deck bars tone (line 184) `tone: b.pct < 0.5 ? ('warn' as const) : ('ok' as const)` → `tone: coverageTone(b.pct)`.
- Resilience KPIs (was compliance): appConsistent tone (line 321) `'ok'` → `appConsistentTone(compliance.appConsistentPct)`; replicated tone (line 331) `'accent'` → `replicatedTone(compliance.replicatedPct)`.
- Resilience deck bars: appConsistent (line 347) `'ok' as const` → `appConsistentTone(compliance.appConsistentPct)`; replicated (line 353) `'accent' as const` → `replicatedTone(compliance.replicatedPct)`.
- Capacity deck bars tone (line 403) `tone: tg.flagged ? ('warn' as const) : ('accent' as const)` → `tone: utilizationTone(tg.utilizationPct)`.

- [ ] **Step 5: Run the export tests**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts`
Expected: PASS (the immutable-0%⇒bad and SUCCESS⇒ok assertions still hold; capacity now `#dc2626`).

- [ ] **Step 6: Commit**

```bash
git add src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts
git commit -m "feat(export): color every value from the central thresholds"
```

---

## Task 4: Plain-language takeaways + exec KPI context

Add a one-line `deck.subtitle` takeaway to the sections that lack one (jobs, resilience, capacity, policies, exposure) and a `detail` context line to the three exec KPIs that lack one. New i18n keys in all four locales.

**Files:**
- Modify: `src/i18n/locales/{en,fr,de,it}/dashboard.json`
- Modify: `src/engines/export/buildExportModel.ts`
- Modify: `src/engines/export/buildExportModel.test.ts`

- [ ] **Step 1: Add i18n keys (all four locales)**

Add a `"takeaway"` sub-key to `jobs`, `resilience`, `capacity`, `policies`, `exposure`, and `coverage`, plus `kpi.unprotectedDetail` / `kpi.jobSuccessDetail` / `kpi.immutableDetail`. English (`en/dashboard.json`):

```json
"coverage": { ...existing..., "takeaway": "{{pct}} of assets have a protection policy" },
"exposure": { ...existing..., "takeaway": "{{count}} assets are completely unprotected" },
"jobs": { ...existing..., "takeaway": "{{pct}} of recent backup jobs succeeded" },
"resilience": { ...existing..., "takeaway": "Ransomware resilience: {{pct}} of copies are immutable" },
"capacity": { ...existing..., "takeaway": "{{count}} storage target(s) are near capacity" },
"policies": { ...existing..., "takeaway": "{{count}} protection policies in force" },
"kpi": { ...existing..., "unprotectedDetail": "Data with no protection policy", "jobSuccessDetail": "Across the recent job window", "immutableDetail": "Copies that cannot be altered or deleted" }
```

French (`fr/dashboard.json`):
```json
"coverage.takeaway": "{{pct}} des ressources ont une politique de protection",
"exposure.takeaway": "{{count}} ressources sont totalement non protégées",
"jobs.takeaway": "{{pct}} des jobs de sauvegarde récents ont réussi",
"resilience.takeaway": "Résilience face aux rançongiciels : {{pct}} des copies sont immuables",
"capacity.takeaway": "{{count}} cible(s) de stockage proche(s) de la saturation",
"policies.takeaway": "{{count}} politiques de protection actives",
"kpi.unprotectedDetail": "Données sans politique de protection",
"kpi.jobSuccessDetail": "Sur la fenêtre de jobs récente",
"kpi.immutableDetail": "Copies qui ne peuvent être ni modifiées ni supprimées"
```

German (`de/dashboard.json`):
```json
"coverage.takeaway": "{{pct}} der Assets haben eine Schutzrichtlinie",
"exposure.takeaway": "{{count}} Assets sind völlig ungeschützt",
"jobs.takeaway": "{{pct}} der letzten Sicherungsjobs waren erfolgreich",
"resilience.takeaway": "Ransomware-Resilienz: {{pct}} der Kopien sind unveränderlich",
"capacity.takeaway": "{{count}} Speicherziel(e) nahe der Kapazitätsgrenze",
"policies.takeaway": "{{count}} aktive Schutzrichtlinien",
"kpi.unprotectedDetail": "Daten ohne Schutzrichtlinie",
"kpi.jobSuccessDetail": "Über das jüngste Job-Fenster",
"kpi.immutableDetail": "Kopien, die nicht geändert oder gelöscht werden können"
```

Italian (`it/dashboard.json`):
```json
"coverage.takeaway": "{{pct}} degli asset ha un criterio di protezione",
"exposure.takeaway": "{{count}} asset sono completamente non protetti",
"jobs.takeaway": "{{pct}} dei job di backup recenti è riuscito",
"resilience.takeaway": "Resilienza ai ransomware: {{pct}} delle copie è immutabile",
"capacity.takeaway": "{{count}} destinazione/i di storage vicina/e alla saturazione",
"policies.takeaway": "{{count}} criteri di protezione attivi",
"kpi.unprotectedDetail": "Dati senza criterio di protezione",
"kpi.jobSuccessDetail": "Sulla finestra di job recente",
"kpi.immutableDetail": "Copie che non possono essere modificate o eliminate"
```

(Place each `*.takeaway` inside its existing object, and the `kpi.*Detail` keys inside the existing `kpi` object.)

- [ ] **Step 2: Write the failing test**

Add to `src/engines/export/buildExportModel.test.ts`:

```ts
  it('gives each section a plain-language takeaway subtitle', () => {
    const m = buildExportModel(view, 'assessment', 'light', t, 'en')
    const byId = Object.fromEntries(m.sections.map((s) => [s.id, s]))
    expect(byId.jobs?.deck?.subtitle).toBe('93% of recent backup jobs succeeded')
    expect(byId.capacity?.deck?.subtitle).toMatch(/near capacity/)
    expect(byId.policies?.deck?.subtitle).toBe('32 protection policies in force')
    const unprotected = m.kpis.find((k) => k.label === t('dashboard:kpi.unprotected'))
    expect(unprotected?.detail).toBe('Data with no protection policy')
  })
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts -t "plain-language takeaway"`
Expected: FAIL — subtitles/detail are undefined.

- [ ] **Step 4: Add subtitles + details in `buildExportModel.ts`**

- Exec KPIs: add `detail` lines — unprotected KPI (after line 108) `detail: t('dashboard:kpi.unprotectedDetail'),`; jobSuccess KPI (after line 113) `detail: t('dashboard:kpi.jobSuccessDetail'),`; immutable KPI (after line 117) `detail: t('dashboard:kpi.immutableDetail'),`.
- Add `subtitle` to each section's `deck` object:
  - `exposure` deck (after `kpiChips: gapsKpis,` line 213): `subtitle: t('dashboard:exposure.takeaway', { count: fmtInt(gaps.count, locale) }),`
  - `jobs` deck (after `kpiChips: jobsKpis,` line 300): `subtitle: t('dashboard:jobs.takeaway', { pct: fmtPercent(jobs.successPct, locale) }),`
  - `resilience` deck (inside its `deck`, line 337): `subtitle: t('dashboard:resilience.takeaway', { pct: fmtPercent(compliance.immutablePct, locale) }),`
  - `capacity` deck (after `kpiChips: [...]` block, line 392): `subtitle: t('dashboard:capacity.takeaway', { count: fmtInt(capacity.flagged.length, locale) }),`
  - `policies` deck (after `kpiChips: policiesKpis,` line 426): `subtitle: t('dashboard:policies.takeaway', { count: fmtInt(policies.count, locale) }),`

- [ ] **Step 5: Run tests + parity**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts src/i18n/keyParity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/i18n/locales
git commit -m "feat(export): plain-language takeaways + exec KPI context"
```

---

## Task 5: Render `ExportSection.table` in the HTML export

**Files:**
- Modify: `src/engines/export/html/assembleHtml.ts`
- Modify: `src/engines/export/html/assembleHtml.test.ts`

**Interfaces:**
- Consumes: `ExportSection.table` (`{ columns, rows, caption? }`).

- [ ] **Step 1: Write the failing test**

Add to `src/engines/export/html/assembleHtml.test.ts` (reuse the existing test's `model` builder; if it builds a model from a view, assert the rendered coverage table):

```ts
  it('renders a section table (columns + rows + caption) in HTML', () => {
    const html = assembleHtml(model, 'light')
    expect(html).toContain('<table')
    expect(html).toContain('<th>') // header cells
    // a coverage by-type row value appears in a cell
    expect(html).toMatch(/<td>[^<]*<\/td>/)
  })
```

(If `assembleHtml.test.ts` does not already have a `model` in scope, build one at the top: `const model = buildExportModel(view, 'assessment', 'light', t, 'en')` using the same `view`/`t` pattern as `buildExportModel.test.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engines/export/html/assembleHtml.test.ts -t "section table"`
Expected: FAIL — no `<table>` in output.

- [ ] **Step 3: Add a `tableHtml` renderer and call it**

In `src/engines/export/html/assembleHtml.ts`, add (after `tilesHtml`, ~line 63):

```ts
/** A section detail table (columns + rows + optional caption). */
function tableHtml(tbl: { columns: string[]; rows: string[][]; caption?: string }): string {
  if (!tbl.rows.length) return ''
  const head = tbl.columns.map((c) => `<th>${esc(c)}</th>`).join('')
  const body = tbl.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  const cap = tbl.caption ? `<caption>${esc(tbl.caption)}</caption>` : ''
  return `<table class="tbl">${cap}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}
```

In `sectionHtml` (~line 82-102), append the table after the body. Change the `return` (line 101) to:

```ts
  const table = s.table ? tableHtml(s.table) : ''
  return `<section>${head}${body}${table}${caveat}</section>`
```

Add table CSS to the `css` template string (after the `.cap` rule, ~line 125):

```ts
    table.tbl{border-collapse:collapse;width:100%;margin-top:14px;font-size:12px} table.tbl caption{caption-side:bottom;color:${p.muted};font-style:italic;text-align:left;margin-top:6px;font-size:11px}
    .tbl th{text-align:left;padding:7px 10px;border-bottom:2px solid ${p.line};color:${p.muted};text-transform:uppercase;letter-spacing:.03em;font-size:10px}
    .tbl td{padding:6px 10px;border-bottom:1px solid ${p.line};font-variant-numeric:tabular-nums}
```

- [ ] **Step 4: Run the HTML tests**

Run: `npx vitest run src/engines/export/html/assembleHtml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/export/html/assembleHtml.ts src/engines/export/html/assembleHtml.test.ts
git commit -m "feat(export): render section tables in the HTML report"
```

---

## Task 6: Render `ExportSection.table` as a full-width PPTX appendix

The graphical band deck is unchanged; sections that carry table rows get a full-width appendix slide appended after the band deck (matching "exec up front, detail behind").

**Files:**
- Modify: `src/engines/export/pptx/slidePlan.ts`
- Modify: `src/engines/export/pptx/slidePlan.test.ts`
- Modify: `src/engines/export/pptx/builder.ts`
- Modify: `src/engines/export/pptx/builder.test.ts`

**Interfaces:**
- Produces: `SlidePlanItem` gains `| { kind: 'table'; section: ExportSection }`. `planSlides` appends one `table` item per section whose `table.rows.length > 0`, in section order, after all band/idle items.

- [ ] **Step 1: Write the failing slidePlan test**

Add to `src/engines/export/pptx/slidePlan.test.ts`:

```ts
  it('appends a full-width table slide for each section that has table rows', () => {
    const withTable = (id: string): ExportSection => ({
      id,
      title: id,
      table: { columns: ['a'], rows: [['1']] },
    })
    const plan = planSlides([sec('coverage'), withTable('policies')])
    const kinds = plan.map((p) => (p.kind === 'table' ? `table:${p.section.id}` : p.kind))
    expect(kinds).toContain('table:policies')
    // the band pair still comes before the appendix
    expect(kinds.indexOf('pair')).toBeLessThan(kinds.indexOf('table:policies'))
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engines/export/pptx/slidePlan.test.ts -t "table slide"`
Expected: FAIL — no `table` items produced.

- [ ] **Step 3: Extend `slidePlan.ts`**

Edit `src/engines/export/pptx/slidePlan.ts`:
- Extend the type (line 4-6):

```ts
export type SlidePlanItem =
  | { kind: 'single'; section: ExportSection }
  | { kind: 'pair'; top: ExportSection; bottom?: ExportSection }
  | { kind: 'table'; section: ExportSection }
```

- At the end of `planSlides`, before each `return`, build the appendix and append it. Simplest: compute it once and concatenate at every return. Replace the function body's two `return` statements so both include the appendix. Concretely, add above the `if (!idle)` line:

```ts
  const appendix: SlidePlanItem[] = sections
    .filter((s) => s.id !== 'idle' && (s.table?.rows.length ?? 0) > 0)
    .map((s) => ({ kind: 'table', section: s }))
```

  then change `if (!idle) return pairs` → `if (!idle) return [...pairs, ...appendix]`, change `return [idleSingle, ...pairs]` → `return [idleSingle, ...pairs, ...appendix]`, and the final `return out` → `return [...out, ...appendix]`.

- [ ] **Step 4: Run slidePlan tests**

Run: `npx vitest run src/engines/export/pptx/slidePlan.test.ts`
Expected: PASS (existing tests use tableless `sec(id)`, so they produce no appendix and still match).

- [ ] **Step 5: Write the failing builder test**

Add to `src/engines/export/pptx/builder.test.ts` a test that a model with a section table produces more slides than one without (pptxgenjs output is opaque, so assert slide count via the deck's `addSlide` count using a spy, OR assert the function resolves to a non-empty ArrayBuffer with the table section present). Use the existing builder.test pattern; minimal robust assertion:

```ts
  it('builds without throwing when a section carries a detail table', async () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    const bytes = await buildPptx(model, 'light')
    expect(bytes.byteLength).toBeGreaterThan(0)
  })
```

(Import `buildExportModel`, `view`, `t` following the existing builder.test.ts setup.)

- [ ] **Step 6: Run to verify it fails or errors**

Run: `npx vitest run src/engines/export/pptx/builder.test.ts -t "detail table"`
Expected: FAIL — `drawTableSlide` not yet handled (the `table` plan item falls through the `for` loop's `if/else`, producing a blank slide; tighten by implementing rendering next).

- [ ] **Step 7: Implement `drawTableSlide` and wire the loop**

In `src/engines/export/pptx/builder.ts`, add a renderer (after `drawIdle`, ~line 277):

```ts
function drawTableSlide(slide: Slide, sec: ExportSection, p: Palette) {
  slide.addText(sec.title, {
    x: M,
    y: 0.4,
    w: CONTENT_W,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: hx(p.ink),
    fontFace: FONT,
  })
  const tbl = sec.table
  if (!tbl || tbl.rows.length === 0) return
  const header = tbl.columns.map((c) => ({
    text: c,
    options: { bold: true, color: hx(p.muted), fill: { color: hx(p.surface) }, fontSize: 11 },
  }))
  const body = tbl.rows.map((r) =>
    r.map((cell) => ({ text: cell, options: { color: hx(p.ink), fontSize: 10 } })),
  )
  slide.addTable([header, ...body], {
    x: M,
    y: 1.2,
    w: CONTENT_W,
    border: { type: 'solid', pt: 0.5, color: hx(p.line) },
    fontFace: FONT,
    valign: 'middle',
    autoPage: true,
    autoPageRepeatHeader: true,
    newSlideStartY: 0.5,
  })
  if (tbl.caption) {
    slide.addText(tbl.caption, {
      x: M,
      y: 7.0,
      w: CONTENT_W,
      h: 0.3,
      fontSize: 9,
      italic: true,
      color: hx(p.muted),
      fontFace: FONT,
    })
  }
}
```

In `buildPptx`'s plan loop (lines 412-428), handle the new kind. Change the `if (item.kind === 'single')` chain to:

```ts
    if (item.kind === 'single') {
      drawIdle(slide, item.section, p)
    } else if (item.kind === 'table') {
      drawTableSlide(slide, item.section, p)
    } else {
      drawSection(slide, item.top, BAND_TOP, p)
      slide.addShape('line' as pptxgen.SHAPE_NAME, {
        x: M,
        y: DIVIDER_Y,
        w: CONTENT_W,
        h: 0,
        line: { color: hx(p.line), width: 1 },
      })
      if (item.bottom) drawSection(slide, item.bottom, BAND_BOTTOM, p)
    }
```

- [ ] **Step 8: Run the pptx tests**

Run: `npx vitest run src/engines/export/pptx/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/engines/export/pptx/slidePlan.ts src/engines/export/pptx/slidePlan.test.ts src/engines/export/pptx/builder.ts src/engines/export/pptx/builder.test.ts
git commit -m "feat(export): full-width appendix table slides in the PPTX deck"
```

---

## Task 7: Per-policy governance table (use the already-computed `perPolicy`)

The `policies` section currently shows only a by-purpose tally. Surface the full per-policy detail that `summarizePolicies` already builds.

**Files:**
- Modify: `src/engines/export/buildExportModel.ts` (policies `table`)
- Modify: `src/engines/export/buildExportModel.test.ts`

**Interfaces:**
- Consumes: `view.policies.perPolicy: PolicyRow[]` (`{ name, purpose, assetCount, protectionCapacityGb }`).

- [ ] **Step 1: Write the failing test**

Add to `src/engines/export/buildExportModel.test.ts` a view with a perPolicy row, then:

```ts
  it('renders a per-policy governance table from perPolicy', () => {
    const v: ReportView = {
      ...view,
      policies: {
        count: 1,
        byPurpose: { CENTRALIZED: 1 },
        perPolicy: [
          { name: 'SQL - Prod', purpose: 'CENTRALIZED', assetCount: 6, protectionCapacityGb: 19732 },
        ],
      },
    }
    const policies = buildExportModel(v, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'policies',
    )
    expect(policies?.table?.columns).toEqual(['Policy', 'Purpose', 'Assets', 'Capacity'])
    expect(policies?.table?.rows[0]?.[0]).toBe('SQL - Prod')
    expect(policies?.table?.rows[0]?.[2]).toBe('6')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts -t "per-policy governance"`
Expected: FAIL — table still shows purpose/count columns.

- [ ] **Step 3: Replace the policies `table` block**

In `src/engines/export/buildExportModel.ts`, replace the `policiesSection.table` (lines 421-424) with a per-policy governance table (keep the by-purpose `deck.bars` as the band view):

```ts
    table: {
      columns: [
        t('dashboard:policies.col.policy'),
        t('dashboard:policies.col.purpose'),
        t('dashboard:policies.col.assets'),
        t('dashboard:policies.col.capacity'),
      ],
      rows: policies.perPolicy.map((pp) => [
        pp.name,
        pp.purpose,
        fmtInt(pp.assetCount, locale),
        formatBytes(gbToBytes(pp.protectionCapacityGb), locale),
      ]),
    },
```

(All four column keys already exist in `dashboard:policies.col.*` in every locale — verified in Task 2's files.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts
git commit -m "feat(export): per-policy governance table from perPolicy"
```

---

## Task 8: Surface `backupLevelMix` on the resilience section

`computeCompliance` builds `backupLevelMix` (e.g. `{ FULL: 150, INCREMENTAL: 2000 }`) but nothing renders it. Show it as the resilience section's detail table.

**Files:**
- Modify: `src/i18n/locales/{en,fr,de,it}/dashboard.json` (resilience `backupLevel`/`level`/`count` cols)
- Modify: `src/engines/export/buildExportModel.ts`
- Modify: `src/engines/export/buildExportModel.test.ts`

- [ ] **Step 1: Add i18n keys (all four locales)** inside the `resilience` object:
  - en: `"backupLevel": "Backup level mix", "level": "Backup level", "count": "Copies"`
  - fr: `"backupLevel": "Répartition des niveaux de sauvegarde", "level": "Niveau de sauvegarde", "count": "Copies"`
  - de: `"backupLevel": "Verteilung der Sicherungsebenen", "level": "Sicherungsebene", "count": "Kopien"`
  - it: `"backupLevel": "Distribuzione dei livelli di backup", "level": "Livello di backup", "count": "Copie"`

- [ ] **Step 2: Write the failing test**

```ts
  it('renders the backup-level mix as the resilience detail table', () => {
    const v: ReportView = {
      ...view,
      compliance: { ...view.compliance, backupLevelMix: { FULL: 150, INCR: 2000 } },
    }
    const res = buildExportModel(v, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'resilience',
    )
    expect(res?.table?.columns).toEqual(['Backup level', 'Copies'])
    expect(res?.table?.rows).toEqual([['FULL', '150'], ['INCR', '2,000']])
  })
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts -t "backup-level mix"`
Expected: FAIL — resilience section has no `table`.

- [ ] **Step 4: Add the table to `complianceSection`**

In `src/engines/export/buildExportModel.ts`, add a `table` to `complianceSection` (after its `kpis` array, ~line 333), built only when there is data:

```ts
    table:
      Object.keys(compliance.backupLevelMix).length > 0
        ? {
            columns: [t('dashboard:resilience.level'), t('dashboard:resilience.count')],
            rows: Object.entries(compliance.backupLevelMix).map(([lvl, n]) => [
              lvl,
              fmtInt(n, locale),
            ]),
          }
        : undefined,
```

- [ ] **Step 5: Run tests + parity**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts src/i18n/keyParity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/i18n/locales
git commit -m "feat(export): surface backup-level mix on the resilience section"
```

---

## Task 9: Storage-target used/free (the one allowed new column read)

**Files:**
- Modify: `src/types/reportView.ts` (`StorageTarget` optional fields)
- Modify: `src/engines/aggregation/capacity.ts`
- Modify: `src/engines/aggregation/capacity.test.ts`
- Modify: `src/i18n/locales/{en,fr,de,it}/dashboard.json` (capacity used/total cols)
- Modify: `src/engines/export/buildExportModel.ts` (capacity `table` columns)
- Modify: `src/engines/export/buildExportModel.test.ts`

**Interfaces:**
- Produces: `StorageTarget` gains `usedGb?: number`, `totalGb?: number`, `freeGb?: number`.

- [ ] **Step 1: Extend the type**

In `src/types/reportView.ts`, add to `StorageTarget` (after `utilizationPct`, line 73):

```ts
  usedGb?: number
  totalGb?: number
  freeGb?: number
```

- [ ] **Step 2: Write the failing capacity test**

Add to `src/engines/aggregation/capacity.test.ts` a workbook whose `Storage Targets` sheet has `Total Used (GB)` and `Total Size (GB)`, then:

```ts
  it('captures used/total/free when the columns are present', () => {
    // makeWorkbook fixture with Storage Targets columns:
    // Name | Type | Utilization (%) | Total Used (GB) | Total Size (GB)
    const cap = computeCapacity(wb)
    expect(cap.targets[0]?.usedGb).toBe(111466.73)
    expect(cap.targets[0]?.totalGb).toBe(127249.42)
    expect(cap.targets[0]?.freeGb).toBeCloseTo(15782.69, 1)
  })
```

(Follow the existing `capacity.test.ts` `makeWorkbook` pattern for the exact fixture shape.)

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/engines/aggregation/capacity.test.ts -t "used/total/free"`
Expected: FAIL — fields are `undefined`.

- [ ] **Step 4: Read the columns in `capacity.ts`**

In `src/engines/aggregation/capacity.ts`, inside the `targets` map (after `utilizationPct`), compute optional used/total/free (only when the cell is present):

```ts
    const hasUsed = cellStr(r, 'Total Used (GB)') !== ''
    const hasTotal = cellStr(r, 'Total Size (GB)') !== ''
    const usedGb = hasUsed ? cellNum(r, 'Total Used (GB)') : undefined
    const totalGb = hasTotal ? cellNum(r, 'Total Size (GB)') : undefined
    const freeGb = usedGb !== undefined && totalGb !== undefined ? totalGb - usedGb : undefined
```

and add `usedGb, totalGb, freeGb` to the returned target object.

- [ ] **Step 5: Add i18n + capacity table columns**

Add to each locale's `capacity` object: en `"used": "Used", "total": "Total", "free": "Free"`; fr `"used": "Utilisé", "total": "Total", "free": "Libre"`; de `"used": "Belegt", "total": "Gesamt", "free": "Frei"`; it `"used": "Usato", "total": "Totale", "free": "Libero"`.

In `buildExportModel.ts`, replace the capacity `table` (lines 370-377) so it includes used/total/free (rendered via Task 5/6):

```ts
    table: {
      columns: [
        t('common:col.name'),
        t('dashboard:capacity.utilization'),
        t('dashboard:capacity.used'),
        t('dashboard:capacity.total'),
        t('dashboard:capacity.free'),
      ],
      rows: capacity.targets.map((tg) => [
        tg.name,
        fmtPercentValue(tg.utilizationPct, locale),
        formatGbOrUnknown(tg.usedGb, locale, t('common:sizeUnknown')),
        formatGbOrUnknown(tg.totalGb, locale, t('common:sizeUnknown')),
        formatGbOrUnknown(tg.freeGb, locale, t('common:sizeUnknown')),
      ]),
    },
```

- [ ] **Step 6: Run the affected tests + parity**

Run: `npx vitest run src/engines/aggregation/capacity.test.ts src/engines/export/buildExportModel.test.ts src/i18n/keyParity.test.ts`
Expected: PASS. (If an existing capacity `buildExportModel` assertion checked the old 3-column table, update it to the new columns.)

- [ ] **Step 7: Commit**

```bash
git add src/types/reportView.ts src/engines/aggregation/capacity.ts src/engines/aggregation/capacity.test.ts src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/i18n/locales
git commit -m "feat(capacity): used/free runway columns on storage targets"
```

---

## Task 10: No-empty-slide suppression rule

Generalize the existing conditional-section pattern: drop any section with nothing to render, and record the drop in the caveats so it is noted, not silently lost.

**Files:**
- Modify: `src/engines/export/buildExportModel.ts`
- Modify: `src/engines/export/buildExportModel.test.ts`
- Modify: `src/i18n/locales/{en,fr,de,it}/common.json` (suppressed-section caveat)

**Interfaces:**
- Produces: a section is omitted when it has no `kpis`, no `table` rows, and no `deck` visual (donut/bars/chips/tiles); its title is appended to `model.warnings`.

- [ ] **Step 1: Add the i18n caveat key (all four locales, `common.json`)**
  - en: `"sectionUnavailable": "{{title}}: no data available for this report"`
  - fr: `"sectionUnavailable": "{{title}} : aucune donnée disponible pour ce rapport"`
  - de: `"sectionUnavailable": "{{title}}: keine Daten für diesen Bericht verfügbar"`
  - it: `"sectionUnavailable": "{{title}}: nessun dato disponibile per questo report"`

- [ ] **Step 2: Write the failing test**

```ts
  it('suppresses an all-empty section and records it in caveats', () => {
    const empty: ReportView = {
      ...view,
      policies: { count: 0, byPurpose: {}, perPolicy: [] },
    }
    const m = buildExportModel(empty, 'assessment', 'light', t, 'en')
    expect(m.sections.find((s) => s.id === 'policies')).toBeUndefined()
    expect(m.warnings?.some((w) => /Policies: no data/.test(w))).toBe(true)
  })
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts -t "suppresses an all-empty"`
Expected: FAIL — empty policies section still emitted (it has KPIs/bars from count 0).

Note: an empty `policies` still builds a `kpiChips` count `0` and zero `byPurpose` bars; treat "0 count + no rows + no bars" as empty. Implement `isRenderable` to check for *meaningful* content: at least one table row, or at least one deck bar/tile, or a donut, or a KPI whose value is non-empty and section count > 0. Keep the rule conservative so current populated sections are unaffected (covered by the full suite in Task 11).

- [ ] **Step 4: Implement the filter**

In `src/engines/export/buildExportModel.ts`, after building the `sections` array (lines 449-451), add a renderability filter that also collects dropped titles:

```ts
  const isRenderable = (s: ExportSection): boolean => {
    const d = s.deck
    const hasDeck = Boolean(
      d && (d.donut || d.tiles?.length || d.bars?.length || d.kpiChips?.length),
    )
    const hasTable = (s.table?.rows.length ?? 0) > 0
    const hasKpis = (s.kpis?.length ?? 0) > 0
    return hasDeck || hasTable || hasKpis
  }
  const dropped = sections.filter((s) => !isRenderable(s))
  const visibleSections = sections.filter(isRenderable)
  const suppressionNotes = dropped.map((s) =>
    t('common:sectionUnavailable', { title: s.title }),
  )
```

Then use `visibleSections` for the model's `sections`, and merge `suppressionNotes` into warnings: change the `warnings` field (line 497) to `warnings: [...new Set([...view.warnings, ...suppressionNotes])]`.

For the test to pass, the empty `policies` must be non-renderable: with `count: 0`, omit the `policiesKpis` chip when `policies.count === 0` and the by-purpose object is empty (no bars). Adjust the policies section so an empty policy set yields no kpis/bars/table — wrap `kpis: policiesKpis` and `deck.kpiChips`/`deck.bars` to be empty when `policies.count === 0`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts src/i18n/keyParity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts src/i18n/locales
git commit -m "feat(export): suppress all-empty sections, record them in caveats"
```

---

## Task 11: Full verification + manual export smoke

**Files:** none (verification only).

- [ ] **Step 1: Typecheck (app + tests)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. (If `noUnusedVariables` flags the removed `immutableTone` import or an unused `excluded` palette ref, fix inline.)

- [ ] **Step 3: Full test run**

Run: `npm run test:run`
Expected: all suites pass, including `keyParity`.

- [ ] **Step 4: Coverage gate**

Run: `npm run test:coverage`
Expected: PASS with engines/utils/privacy ≥ 75%.

- [ ] **Step 5: Build (triggers the supply-chain gate)**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Manual export smoke (local only — `ref/` is gitignored, present on this machine)**

Run: `npm run pptx -- ref/PPDM.xlsx --out /tmp/ppdm-p0.pptx && ls -la /tmp/ppdm-p0.pptx`
Expected: a non-empty `.pptx`. Open it and visually confirm: tones reflect thresholds (DD 87.6% bar is red), section titles read "Recovery exposure" / "Cyber-resilience", and full-width appendix slides show the per-policy table, full by-type coverage, backup-level mix, and capacity used/free.

- [ ] **Step 7: Final commit (if any lint fixes were needed)**

```bash
git add -A
git commit -m "chore(export): P0 verification fixups" || echo "nothing to commit"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage** (against `2026-06-22-deck-deeper-insights-design.md`, P0 line items):
- `thresholds.ts` centralized → Task 1. ✅
- Tone + takeaways on existing KPIs → Tasks 3, 4. ✅
- Serialize/surface dropped data: per-policy → Task 7; backupLevelMix → Task 8; full by-type table → already built, now *rendered* by Tasks 5/6; storage used/free → Task 9. ✅
- SectionId renames → Task 2. ✅
- No-empty-slide rule → Task 10. ✅
- C1 (no empty slides) → Task 10; C2 (color + context) → Tasks 1, 3, 4. ✅
- Constraints (pure engines, i18n parity ×4, ≥75% coverage, CI order) → Global Constraints + Task 11. ✅
- **Adjustment vs spec:** the spec said "serialize the dropped data"; planning found `ExportSection.table` is *already serialized but unrendered*, so P0 renders it (Tasks 5/6) rather than re-serializing. Net effect matches the spec's intent (the data reaches the reader).

**2. Placeholder scan:** no TBD/TODO; every code step shows real code; i18n strings are real in all four locales. ✅

**3. Type consistency:** `ExportTone` return type consistent across all threshold fns; `StorageTarget.{usedGb,totalGb,freeGb}` defined in Task 9 before use; `SlidePlanItem` `table` kind defined in Task 6 before the builder consumes it; section ids `exposure`/`resilience` renamed in Task 2 before later tasks reference them. ✅
