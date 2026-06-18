# Graphical Two-Band PPTX Deck Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution uses **sonnet-tier** subagents.

**Goal:** Replace the empty/tabular PPTX deck with a chart-rich one: every slide carries a visual, two report sections per slide stacked as horizontal bands, native-feeling vector graphics, no data tables.

**Architecture:** `buildExportModel` gains an **additive, PPTX-only `deck` layout** per section (plus a `posture` stack on the model) computed from the existing `ReportView` — the HTML export's fields are left untouched so its output and tests don't change. A new pure `planSlides` module pairs sections into band-slides (idle + exec stay full-width). `pptx/builder.ts` is rewritten to draw bands using pptxgenjs **shapes** (KPI cards, tracks/fills for bars, tiles, posture stack) and one **native doughnut** for coverage — all theme- and locale-aware.

**Tech Stack:** TypeScript, pptxgenjs (already a dynamic-import dependency), vitest, biome, i18next (en/fr/de/it).

## Global Constraints

- **Fonts:** all deck text uses **Arial** (`fontFace: 'Arial'`).
- **Units:** PPDM is **base-10**; reuse existing `formatBytes`/`gbToBytes` (no unit math invented).
- **No new dependencies** — the supply-chain gate (`npm run check:supply-chain`) must stay green; no telemetry/analytics packages.
- **No new `ReportView` metrics** — read existing fields only (`capacity.flagged` already exists; do not invent a utilization threshold number).
- **Both themes** (`light`/`dark`) drive every color from `LIGHT`/`DARK` in `src/theme/palette.ts` (which already has `bg, surface, ink, muted, line, accent, ok, warn, bad, excluded, series`).
- **Both flavors** (`assessment`/`ops`) must produce valid decks.
- **i18n parity:** any new key must be added to **all four** locales (`en, fr, de, it`) so `src/i18n/keyParity.test.ts` stays green.
- **HTML export untouched:** do not change `src/engines/export/html/assembleHtml.ts` or its tests; `buildExportModel`'s existing outputs (`kpis`, `chart`, `table`, `notes`) stay exactly as today.
- **Gates:** `npm run typecheck`, `npm run lint`, `npm run test:run` all pass after every task. Commit after each task.

---

### Task 1: Add the two new i18n keys (all four locales)

**Files:**
- Modify: `src/i18n/locales/en/dashboard.json`, `src/i18n/locales/fr/dashboard.json`, `src/i18n/locales/de/dashboard.json`, `src/i18n/locales/it/dashboard.json`
- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/fr/common.json`, `src/i18n/locales/de/common.json`, `src/i18n/locales/it/common.json`
- Test: `src/i18n/keyParity.test.ts` (existing — must stay green)

**Interfaces:**
- Produces: i18n keys `dashboard:capacity.flagged` (interpolates `{{count}}`) and `common:fullListInExcel`.

- [ ] **Step 1: Add `capacity.flagged` to each dashboard catalog**

In each `*/dashboard.json`, add a `"flagged"` key inside the existing `"capacity"` object (next to `"utilization"` and `"mtrees"`):

- `en`: `"flagged": "{{count}} near capacity"`
- `fr`: `"flagged": "{{count}} proche de la saturation"`
- `de`: `"flagged": "{{count}} nahe der Kapazität"`
- `it`: `"flagged": "{{count}} vicini alla saturazione"`

- [ ] **Step 2: Add `fullListInExcel` to each common catalog**

In each `*/common.json`, add a top-level key (next to `"topOf"`):

- `en`: `"fullListInExcel": "Full list in the Excel export"`
- `fr`: `"fullListInExcel": "Liste complète dans l'export Excel"`
- `de`: `"fullListInExcel": "Vollständige Liste im Excel-Export"`
- `it`: `"fullListInExcel": "Elenco completo nell'esportazione Excel"`

- [ ] **Step 3: Verify parity**

Run: `npm run test:run -- src/i18n/keyParity.test.ts`
Expected: PASS (all four locales share the same key set).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales
git commit -m "i18n: add capacity.flagged and fullListInExcel keys (en/fr/de/it)"
```

---

### Task 2: Add the PPTX-only `deck` layout types

**Files:**
- Modify: `src/engines/export/types.ts`

**Interfaces:**
- Produces: `DeckBar`, `DeckDonut`, `DeckStack`, `DeckSection`; `ExportSection.deck?: DeckSection`; `ExportModel.posture?: DeckStack`. Colors are sRGB hex **with** leading `#` (the builder strips it). All text is already localized.

- [ ] **Step 1: Append the deck types and extend the interfaces**

Add to `src/engines/export/types.ts` (keep all existing exports unchanged):

```ts
/** One horizontal bar (shape-drawn): localized label + value, 0..1 fill ratio, tone hex. */
export interface DeckBar {
  label: string
  /** 0..1 fill fraction of the track. */
  ratio: number
  /** Already-localized end value, e.g. "78.9 %", "11.0 TB", "9,297". */
  value: string
  /** sRGB hex (with '#') for the active theme. */
  color: string
}

/** A small doughnut for a band's label zone (coverage). */
export interface DeckDonut {
  slices: { value: number; color: string }[]
  /** Localized center label, e.g. "71 %". */
  center: string
}

/** A single 100%-stacked bar (exec protection posture). */
export interface DeckStack {
  segments: { ratio: number; color: string; label: string; value: string }[]
}

/** PPTX-only layout for a section. The HTML export ignores this field. */
export interface DeckSection {
  subtitle?: string
  kpiChips?: ExportKpi[]
  donut?: DeckDonut
  bars?: DeckBar[]
  tiles?: string[]
}
```

Then add one field to the existing `ExportSection` interface:

```ts
  /** PPTX-only band layout (additive; HTML export ignores it). */
  deck?: DeckSection
```

And one field to the existing `ExportModel` interface:

```ts
  /** PPTX-only exec protection-posture stacked bar. */
  posture?: DeckStack
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS (purely additive optional fields).

- [ ] **Step 3: Commit**

```bash
git add src/engines/export/types.ts
git commit -m "feat(export): add PPTX-only deck layout types"
```

---

### Task 3: `planSlides` — pair sections into band-slides (pure, TDD)

**Files:**
- Create: `src/engines/export/pptx/slidePlan.ts`
- Test: `src/engines/export/pptx/slidePlan.test.ts`

**Interfaces:**
- Consumes: `ExportSection[]` (flavor-ordered, from `ExportModel.sections`).
- Produces: `planSlides(sections: ExportSection[]): SlidePlanItem[]` where
  `type SlidePlanItem = { kind: 'single'; section: ExportSection } | { kind: 'pair'; top: ExportSection; bottom?: ExportSection }`.
  Rule: the `idle` section becomes a `single` placed immediately **after** the pair containing the section that precedes it in order (or first if idle is first). All other sections pair consecutively in order.

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/export/pptx/slidePlan.test.ts
import { describe, expect, it } from 'vitest'
import type { ExportSection } from '../types'
import { planSlides } from './slidePlan'

const sec = (id: string): ExportSection => ({ id, title: id })

describe('planSlides', () => {
  it('assessment order: pairs around a full-width idle single', () => {
    const ids = ['coverage', 'gaps', 'idle', 'jobs', 'compliance', 'capacity', 'policies']
    const plan = planSlides(ids.map(sec))
    expect(
      plan.map((p) =>
        p.kind === 'single' ? `single:${p.section.id}` : `pair:${p.top.id}+${p.bottom?.id}`,
      ),
    ).toEqual([
      'pair:coverage+gaps',
      'single:idle',
      'pair:jobs+compliance',
      'pair:capacity+policies',
    ])
  })

  it('ops order: idle single lands after the pair holding its predecessor', () => {
    const ids = ['jobs', 'compliance', 'capacity', 'coverage', 'gaps', 'idle', 'policies']
    const plan = planSlides(ids.map(sec))
    expect(
      plan.map((p) =>
        p.kind === 'single' ? `single:${p.section.id}` : `pair:${p.top.id}+${p.bottom?.id}`,
      ),
    ).toEqual([
      'pair:jobs+compliance',
      'pair:capacity+coverage',
      'pair:gaps+policies',
      'single:idle',
    ])
  })

  it('no idle: just consecutive pairs', () => {
    const plan = planSlides(['coverage', 'gaps', 'jobs', 'compliance'].map(sec))
    expect(plan.map((p) => (p.kind === 'pair' ? `${p.top.id}+${p.bottom?.id}` : p.section.id))).toEqual(
      ['coverage+gaps', 'jobs+compliance'],
    )
  })

  it('odd non-idle count: trailing section is a lone pair (bottom undefined)', () => {
    const plan = planSlides(['coverage', 'gaps', 'jobs'].map(sec))
    expect(plan[1]).toEqual({ kind: 'pair', top: expect.objectContaining({ id: 'jobs' }), bottom: undefined })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/engines/export/pptx/slidePlan.test.ts`
Expected: FAIL — `planSlides` is not defined.

- [ ] **Step 3: Implement `planSlides`**

```ts
// src/engines/export/pptx/slidePlan.ts
import type { ExportSection } from '../types'

export type SlidePlanItem =
  | { kind: 'single'; section: ExportSection }
  | { kind: 'pair'; top: ExportSection; bottom?: ExportSection }

/**
 * Pair sections into band-slides. `idle` is pulled out as a full-width single
 * placed right after the pair holding the section that precedes it (or first
 * if idle leads). Every other section pairs consecutively in order.
 */
export function planSlides(sections: ExportSection[]): SlidePlanItem[] {
  const idleIdx = sections.findIndex((s) => s.id === 'idle')
  const idle = idleIdx >= 0 ? sections[idleIdx] : undefined
  const predecessorId = idleIdx > 0 ? sections[idleIdx - 1].id : null

  const rest = sections.filter((s) => s.id !== 'idle')
  const pairs: SlidePlanItem[] = []
  for (let i = 0; i < rest.length; i += 2) {
    pairs.push({ kind: 'pair', top: rest[i], bottom: rest[i + 1] })
  }

  if (!idle) return pairs

  const idleSingle: SlidePlanItem = { kind: 'single', section: idle }
  if (predecessorId === null) return [idleSingle, ...pairs]

  const afterIdx = pairs.findIndex(
    (p) => p.kind === 'pair' && (p.top.id === predecessorId || p.bottom?.id === predecessorId),
  )
  const out = [...pairs]
  out.splice(afterIdx + 1, 0, idleSingle)
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/engines/export/pptx/slidePlan.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/engines/export/pptx/slidePlan.ts src/engines/export/pptx/slidePlan.test.ts
git commit -m "feat(export): planSlides pairs sections into band-slides"
```

---

### Task 4: `buildExportModel` emits `deck` data + `posture` (TDD)

**Files:**
- Modify: `src/engines/export/buildExportModel.ts`
- Test: `src/engines/export/buildExportModel.test.ts` (add cases; keep existing ones green)

**Interfaces:**
- Consumes: existing `ReportView` fields; `DeckBar/DeckDonut/DeckStack/DeckSection` (Task 2); i18n keys (Task 1).
- Produces: each `ExportSection` gains a populated `deck`; `ExportModel` gains `posture`. Existing fields (`chart`, `table`, `kpis`, `notes`) are **unchanged**.

- [ ] **Step 1: Write the failing tests**

Add to `src/engines/export/buildExportModel.test.ts` (reuse the existing `view`/`t` fixtures):

```ts
  it('builds a deck for every section + a posture stack', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    const byId = Object.fromEntries(model.sections.map((s) => [s.id, s]))

    // coverage: mini-donut (overall) + per-type bars
    expect(byId.coverage.deck?.donut?.center).toBe('71 %')
    expect(byId.coverage.deck?.donut?.slices.map((s) => s.color)).toEqual([
      '#16a34a',
      '#dc2626',
      '#cbd5e1',
    ])
    expect(byId.coverage.deck?.bars?.[0]).toMatchObject({ label: 'SQL Databases', value: '71.7 %' })

    // jobs: status bars derived from counts, success colored ok
    const success = byId.jobs.deck?.bars?.find((b) => b.label === 'SUCCESS')
    expect(success).toMatchObject({ value: '9,297', color: '#16a34a' })

    // compliance: three percent bars; immutable (0%) colored bad
    const immut = byId.compliance.deck?.bars?.find((b) => b.value === '0 %')
    expect(immut?.color).toBe('#dc2626')

    // capacity: flagged target colored warn + a flagged KPI chip
    expect(byId.capacity.deck?.bars?.[0]).toMatchObject({ label: 'dd1', color: '#d97706' })
    expect(byId.capacity.deck?.kpiChips?.some((k) => /near capacity/.test(k.label))).toBe(true)

    // policies: by-purpose bars
    expect(byId.policies.deck?.bars?.map((b) => b.label)).toEqual(['CENTRALIZED', 'EXCLUSION'])

    // idle: complete tile list (never truncated)
    expect(byId.idle.deck?.tiles).toEqual(['Oracle Databases', 'NAS'])

    // exec posture: protected / unprotected / excluded segments
    expect(model.posture?.segments.map((s) => s.color)).toEqual(['#16a34a', '#dc2626', '#cbd5e1'])
  })

  it('caps deck gap bars at 10 and notes the Excel fallback', () => {
    const many = {
      ...view,
      gaps: {
        ...view.gaps,
        top: {
          total: 281,
          shown: 12,
          items: Array.from({ length: 12 }, (_, i) => ({
            name: `A${i}`,
            type: 'FILE_SYSTEM',
            sizeGb: 100 - i,
          })),
        },
      },
    }
    const gaps = buildExportModel(many, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'gaps',
    )
    expect(gaps?.deck?.bars).toHaveLength(10)
    expect(gaps?.notes?.some((n) => /Excel/.test(n))).toBe(true)
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:run -- src/engines/export/buildExportModel.test.ts`
Expected: FAIL — `deck`/`posture` are undefined.

- [ ] **Step 3: Add deck-building helpers and populate `deck`/`posture`**

In `src/engines/export/buildExportModel.ts`, add these pure helpers above `buildExportModel` (note the imports it already has: `DARK, LIGHT` palette, `fmtInt, fmtPercent, fmtPercentValue, formatBytes, gbToBytes`; add `fmtPercentWhole` to that import, and import the new types + `toneHex`):

```ts
import { fmtInt, fmtPercent, fmtPercentValue, fmtPercentWhole, formatBytes, gbToBytes } from '../../utils/format'
import { immutableTone, toneHex } from './tone'
import type { DeckBar, DeckStack, ExportModel, ExportSection, ExportTheme, ExportTone } from './types'
import type { Palette } from '../../theme/palette'

/** Build ratio-normalized bars from (label, magnitude) pairs. */
function toBars(
  rows: { label: string; magnitude: number; value: string; tone: ExportTone }[],
  pal: Palette,
): DeckBar[] {
  const max = Math.max(1, ...rows.map((r) => r.magnitude))
  return rows.map((r) => ({
    label: r.label,
    ratio: r.magnitude / max,
    value: r.value,
    color: toneHex(r.tone, pal),
  }))
}

const JOB_TONE: Record<string, ExportTone> = {
  SUCCESS: 'ok',
  RETRIED: 'warn',
  SKIPPED: 'muted',
  CANCELED: 'bad',
  FAILED: 'bad',
}
```

Then, inside `buildExportModel`, after `pal` is defined and each section object is created, attach `deck` data. Concretely:

- **coverage** — add to `coverageSection`:

```ts
    deck: {
      subtitle: t('dashboard:coverage.headline', { pct: fmtPercent(coverage.overall.pct, locale) }),
      donut: {
        center: fmtPercentWhole(coverage.overall.pct, locale),
        slices: [
          { value: coverage.overall.protected, color: pal.ok },
          { value: coverage.overall.unprotected, color: pal.bad },
          { value: coverage.overall.excluded, color: pal.excluded },
        ],
      },
      bars: toBars(
        Object.entries(coverage.byType)
          .sort(([, a], [, b]) => b.pct - a.pct)
          .slice(0, 6)
          .map(([type, b]) => ({
            label: type,
            magnitude: b.pct,
            value: fmtPercent(b.pct, locale),
            tone: b.pct < 0.5 ? 'warn' : 'ok',
          })),
        pal,
      ),
    },
```

- **gaps** — add to `gapsSection` (cap at 10; add the Excel note):

```ts
    deck: {
      kpiChips: gapsSection.kpis,
      bars: toBars(
        gaps.top.items.slice(0, 10).map((a) => ({
          label: a.name,
          magnitude: a.sizeGb,
          value: formatBytes(gbToBytes(a.sizeGb), locale),
          tone: 'bad' as const,
        })),
        pal,
      ),
    },
    notes: [
      t('common:topOf', { shown: Math.min(10, gaps.top.total), total: gaps.top.total }),
      t('common:fullListInExcel'),
    ],
```

- **jobs** — add to `jobsSection`:

```ts
    deck: {
      kpiChips: jobsSection.kpis,
      bars: toBars(
        Object.entries(jobs.counts).map(([status, n]) => ({
          label: status,
          magnitude: n,
          value: fmtInt(n, locale),
          tone: JOB_TONE[status] ?? 'accent',
        })),
        pal,
      ),
    },
```

- **compliance** — add to `complianceSection`:

```ts
    deck: {
      bars: toBars(
        [
          {
            label: t('dashboard:compliance.appConsistent'),
            magnitude: compliance.appConsistentPct,
            value: fmtPercent(compliance.appConsistentPct, locale),
            tone: 'ok' as const,
          },
          {
            label: t('dashboard:compliance.replicated'),
            magnitude: compliance.replicatedPct,
            value: fmtPercent(compliance.replicatedPct, locale),
            tone: 'accent' as const,
          },
          {
            label: t('dashboard:compliance.immutable'),
            magnitude: compliance.immutablePct,
            value: fmtPercent(compliance.immutablePct, locale),
            tone: immutableTone(compliance.immutablePct),
          },
        ],
        pal,
      ),
    },
```

- **capacity** — add to `capacitySection` (flagged → warn; mtrees + flagged chips):

```ts
    deck: {
      kpiChips: [
        { label: t('dashboard:capacity.mtrees', { count: '' }).trim(), value: fmtInt(capacity.mtreeCount, locale), tone: 'accent' },
        { label: t('dashboard:capacity.flagged', { count: '' }).trim(), value: fmtInt(capacity.flagged.length, locale), tone: 'warn' },
      ],
      bars: toBars(
        capacity.targets
          .slice()
          .sort((a, b) => b.utilizationPct - a.utilizationPct)
          .slice(0, 6)
          .map((tg) => ({
            label: tg.name,
            magnitude: tg.utilizationPct,
            value: fmtPercentValue(tg.utilizationPct, locale),
            tone: tg.flagged ? ('warn' as const) : ('accent' as const),
          })),
        pal,
      ),
    },
```

(Note: the chip labels above strip the `{{count}}` interpolation to use the catalog text as a bare label; the numeric value lives in `value`. If the resulting label reads awkwardly, prefer dedicated short label keys — but the trimmed form is acceptable for v1.)

- **policies** — add to `policiesSection`:

```ts
    deck: {
      kpiChips: policiesSection.kpis,
      bars: toBars(
        Object.entries(policies.byPurpose).map(([purpose, n], i) => ({
          label: purpose,
          magnitude: n,
          value: fmtInt(n, locale),
          tone: i === 0 ? ('accent' as const) : ('muted' as const),
        })),
        pal,
      ),
    },
```

- **idle** — add to the `idleSection` object (when non-null):

```ts
          deck: {
            subtitle: t('dashboard:idle.subtitle'),
            tiles: idleAgents,
          },
```

- **posture** — in the returned `ExportModel`, add:

```ts
    posture: {
      segments: [
        { ratio: 0, color: pal.ok, label: t('dashboard:coverage.protected'), value: fmtInt(coverage.overall.protected, locale) },
        { ratio: 0, color: pal.bad, label: t('dashboard:coverage.unprotected'), value: fmtInt(coverage.overall.unprotected, locale) },
        { ratio: 0, color: pal.excluded, label: t('dashboard:coverage.excluded'), value: fmtInt(coverage.overall.excluded, locale) },
      ].map((seg, _i, arr) => seg) as DeckStack['segments'],
    },
```

Replace the placeholder ratios with a computed total so segments sum to 1:

```ts
    posture: ((): DeckStack => {
      const o = coverage.overall
      const total = Math.max(1, o.protected + o.unprotected + o.excluded)
      return {
        segments: [
          { ratio: o.protected / total, color: pal.ok, label: t('dashboard:coverage.protected'), value: fmtInt(o.protected, locale) },
          { ratio: o.unprotected / total, color: pal.bad, label: t('dashboard:coverage.unprotected'), value: fmtInt(o.unprotected, locale) },
          { ratio: o.excluded / total, color: pal.excluded, label: t('dashboard:coverage.excluded'), value: fmtInt(o.excluded, locale) },
        ],
      }
    })(),
```

(Use the second `posture` form; the first is shown only to illustrate the segment shape — delete it.)

- [ ] **Step 4: Run to verify they pass (and existing tests stay green)**

Run: `npm run test:run -- src/engines/export/buildExportModel.test.ts`
Expected: PASS — new deck/posture assertions pass; all pre-existing assertions (table/chart/notes/footer) still pass.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engines/export/buildExportModel.ts src/engines/export/buildExportModel.test.ts
git commit -m "feat(export): build PPTX deck layout + posture from ReportView"
```

---

### Task 5: Rewrite `pptx/builder.ts` to draw the two-band deck

**Files:**
- Modify: `src/engines/export/pptx/builder.ts` (full rewrite of layout; same exported signature)
- Test: `src/engines/export/pptx/builder.test.ts` (extend with a deck-populated, both-flavors smoke test)

**Interfaces:**
- Consumes: `ExportModel` with `deck`/`posture` (Task 4), `planSlides` (Task 3), `Palette`.
- Produces: `buildPptx(model: ExportModel, theme: ExportTheme): Promise<ArrayBuffer>` (unchanged signature — `src/hooks/useExport.ts` keeps working).

- [ ] **Step 1: Write the failing test**

Replace the body of `src/engines/export/pptx/builder.test.ts` with a real-model smoke test driven through `buildExportModel` (so the deck fields are populated) for both themes and both flavors:

```ts
import { describe, expect, it } from 'vitest'
import i18n from '../../../i18n'
import type { ReportView } from '../../../types/reportView'
import { buildExportModel } from '../buildExportModel'
import { buildPptx } from './builder'

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string

const view: ReportView = {
  meta: { projectId: '1', customer: 'WHO', collectorBuild: '27.2.5.278', capturedAt: '2026-06-15T00:00:00.000Z', baseTen: true },
  inUse: ['SQL Databases'],
  idleAgents: ['Oracle Databases', 'NAS'],
  warnings: [],
  coverage: {
    byType: { 'SQL Databases': { protected: 380, unprotected: 150, excluded: 224, pct: 0.717, pctInclExcluded: 0.504 } },
    overall: { protected: 703, unprotected: 281, excluded: 377, pct: 0.714, pctInclExcluded: 0.517 },
  },
  gaps: { count: 281, totalCapacityGb: 263000, top: { items: [{ name: 'HR_PAYROLL', type: 'MSSQL', sizeGb: 842.6 }], total: 281, shown: 1 } },
  jobs: { counts: { SUCCESS: 9297, RETRIED: 635 }, total: 10000, successPct: 0.93, capped: true, windowSize: 10000 },
  compliance: { appConsistentPct: 0.77, immutablePct: 0, replicatedPct: 0.32, backupLevelMix: {}, windowSize: 10000, capped: true },
  capacity: { targets: [{ name: 'dd1', type: 'DATA_DOMAIN_SYSTEM', utilizationPct: 87.6, flagged: true }], flagged: [{ name: 'dd1', type: 'DATA_DOMAIN_SYSTEM', utilizationPct: 87.6, flagged: true }], mtreeCount: 17 },
  policies: { count: 32, byPurpose: { CENTRALIZED: 29, EXCLUSION: 3 }, perPolicy: [] },
}

describe('buildPptx (deck)', () => {
  it('produces a valid .pptx for both themes and both flavors', async () => {
    await i18n.changeLanguage('en')
    for (const flavor of ['assessment', 'ops'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const model = buildExportModel(view, flavor, theme, t, 'en')
        const buf = await buildPptx(model, theme)
        expect(buf.byteLength).toBeGreaterThan(1000)
        const head = new Uint8Array(buf.slice(0, 2))
        expect(head[0]).toBe(0x50) // 'P'
        expect(head[1]).toBe(0x4b) // 'K'
      }
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/engines/export/pptx/builder.test.ts`
Expected: FAIL (the new builder isn't written yet / old builder ignores deck — the test still passes structurally, so to force a true red, first delete the old `addSection`/`buildPptx` body in Step 3, then this test drives the rewrite). If it passes against the old builder, proceed to Step 3 anyway — the rewrite is required for the visual outcome and is verified in Task 6.

- [ ] **Step 3: Replace `builder.ts` with the band renderer**

Full file content for `src/engines/export/pptx/builder.ts`:

```ts
import pptxgen from 'pptxgenjs'
import { DARK, LIGHT, type Palette } from '../../../theme/palette'
import { toneHex } from '../tone'
import type { DeckBar, DeckDonut, DeckSection, DeckStack, ExportModel, ExportSection, ExportTheme } from '../types'
import { planSlides } from './slidePlan'

type Slide = ReturnType<pptxgen['addSlide']>

const hx = (c: string) => c.replace('#', '')
const FONT = 'Arial'

// LAYOUT_WIDE canvas
const SLIDE_W = 13.333
const M = 0.5
const CONTENT_W = SLIDE_W - 2 * M // 12.333

// Band geometry
const BAND_TOP = 0.35
const BAND_H = 3.35
const DIVIDER_Y = 3.8
const BAND_BOTTOM = 3.95
const LABEL_W = 2.3
const CHART_X = M + LABEL_W + 0.35 // 3.15
const CHART_W = SLIDE_W - M - CHART_X // ~9.68

function kpiCard(
  slide: Slide,
  pptx: pptxgen,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  label: string,
  color: string,
  p: Palette,
  valueSize = 20,
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: hx(p.surface) }, line: { color: hx(p.line), width: 1 },
  })
  slide.addText(
    [
      { text: `${value}\n`, options: { bold: true, color: hx(color), fontSize: valueSize } },
      { text: label, options: { color: hx(p.muted), fontSize: 10 } },
    ],
    { x: x + 0.14, y, w: w - 0.28, h, valign: 'middle', align: 'left', fontFace: FONT },
  )
}

function drawBars(slide: Slide, pptx: pptxgen, x: number, y: number, w: number, h: number, data: DeckBar[], p: Palette) {
  if (data.length === 0) return
  const rowH = h / data.length
  const labelW = 1.7
  const valueW = 1.0
  const trackX = x + labelW
  const trackW = w - labelW - valueW - 0.15
  const barH = Math.min(0.28, rowH * 0.5)
  data.forEach((b, i) => {
    const top = y + i * rowH
    slide.addText(b.label, { x, y: top, w: labelW - 0.1, h: rowH, valign: 'middle', align: 'left', fontSize: 11, color: hx(p.muted), fontFace: FONT })
    const ty = top + (rowH - barH) / 2
    slide.addShape(pptx.ShapeType.roundRect, { x: trackX, y: ty, w: trackW, h: barH, rectRadius: 0.04, fill: { color: hx(p.line) } })
    const fw = Math.max(0.04, trackW * Math.max(0, Math.min(1, b.ratio)))
    slide.addShape(pptx.ShapeType.roundRect, { x: trackX, y: ty, w: fw, h: barH, rectRadius: 0.04, fill: { color: hx(b.color) } })
    slide.addText(b.value, { x: trackX + trackW + 0.1, y: top, w: valueW, h: rowH, valign: 'middle', align: 'right', fontSize: 11, bold: true, color: hx(p.ink), fontFace: FONT })
  })
}

function drawDonut(slide: Slide, pptx: pptxgen, x: number, y: number, d: number, donut: DeckDonut, p: Palette) {
  slide.addChart(
    'doughnut',
    [{ name: 'c', labels: donut.slices.map((_, i) => String(i)), values: donut.slices.map((s) => s.value) }],
    {
      x, y, w: d, h: d, holeSize: 62,
      chartColors: donut.slices.map((s) => hx(s.color)),
      showLegend: false, showTitle: false, showValue: false, showPercent: false,
      dataBorder: { pt: 1, color: hx(p.bg) },
    },
  )
  slide.addText(donut.center, { x, y, w: d, h: d, align: 'center', valign: 'middle', fontSize: 15, bold: true, color: hx(p.ink), fontFace: FONT })
}

function drawSection(slide: Slide, pptx: pptxgen, sec: ExportSection, top: number, p: Palette) {
  const d: DeckSection | undefined = sec.deck
  slide.addText(sec.title, { x: M, y: top + 0.12, w: LABEL_W + 1.2, h: 0.4, fontSize: 16, bold: true, color: hx(p.ink), fontFace: FONT })
  if (d?.subtitle) {
    slide.addText(d.subtitle, { x: M, y: top + 0.58, w: LABEL_W, h: 0.6, fontSize: 9, color: hx(p.muted), valign: 'top', fontFace: FONT })
  }
  if (d?.donut) {
    drawDonut(slide, pptx, M + 0.3, top + 1.15, 1.5, d.donut, p)
  } else if (d?.kpiChips?.length) {
    d.kpiChips.slice(0, 2).forEach((k, i) =>
      kpiCard(slide, pptx, M, top + 0.95 + i * 0.95, LABEL_W, 0.82, k.value, k.label, toneHex(k.tone, p), p),
    )
  }
  if (d?.bars?.length) {
    drawBars(slide, pptx, CHART_X, top + 0.7, CHART_W, BAND_H - 1.0, d.bars, p)
  }
  if (sec.notes?.length) {
    slide.addText(sec.notes.join('   ·   '), { x: CHART_X, y: top + BAND_H - 0.3, w: CHART_W, h: 0.28, fontSize: 8, italic: true, color: hx(p.muted), fontFace: FONT })
  }
}

function drawTiles(slide: Slide, pptx: pptxgen, x: number, y: number, w: number, items: string[], p: Palette) {
  const cols = 4
  const rows = Math.ceil(items.length / cols)
  const gap = 0.18
  const tw = (w - gap * (cols - 1)) / cols
  const th = Math.min(0.7, (5.0 - gap * (rows - 1)) / Math.max(rows, 1))
  items.forEach((name, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    slide.addText(name, {
      x: x + c * (tw + gap), y: y + r * (th + gap), w: tw, h: th,
      shape: pptx.ShapeType.roundRect, rectRadius: 0.06,
      fill: { color: hx(p.surface) }, line: { color: hx(p.accent), width: 1 },
      align: 'left', valign: 'middle', fontSize: 11, bold: true, color: hx(p.ink), fontFace: FONT, margin: 8,
    })
  })
}

function drawIdle(slide: Slide, pptx: pptxgen, sec: ExportSection, p: Palette) {
  slide.addText(sec.title, { x: M, y: 0.4, w: CONTENT_W, h: 0.6, fontSize: 24, bold: true, color: hx(p.ink), fontFace: FONT })
  if (sec.deck?.subtitle) {
    slide.addText(sec.deck.subtitle, { x: M, y: 1.0, w: CONTENT_W, h: 0.4, fontSize: 13, color: hx(p.muted), fontFace: FONT })
  }
  if (sec.deck?.tiles?.length) drawTiles(slide, pptx, M, 1.7, CONTENT_W, sec.deck.tiles, p)
}

function drawExec(slide: Slide, pptx: pptxgen, model: ExportModel, p: Palette) {
  slide.addText(model.execTitle, { x: M, y: 0.4, w: CONTENT_W, h: 0.6, fontSize: 24, bold: true, color: hx(p.ink), fontFace: FONT })
  const cardW = (CONTENT_W - 3 * 0.3) / 4
  model.kpis.slice(0, 4).forEach((k, i) =>
    kpiCard(slide, pptx, M + i * (cardW + 0.3), 1.4, cardW, 1.6, k.value, k.label, toneHex(k.tone, p), p, 30),
  )
  const posture: DeckStack | undefined = model.posture
  if (posture) {
    let cx = M
    const barY = 4.3
    posture.segments.forEach((seg) => {
      const sw = CONTENT_W * Math.max(0, Math.min(1, seg.ratio))
      slide.addShape(pptx.ShapeType.rect, { x: cx, y: barY, w: Math.max(0.02, sw), h: 0.55, fill: { color: hx(seg.color) } })
      cx += sw
    })
    let lx = M
    posture.segments.forEach((seg) => {
      slide.addShape(pptx.ShapeType.rect, { x: lx, y: 5.15, w: 0.16, h: 0.16, fill: { color: hx(seg.color) } })
      slide.addText(`${seg.label}: ${seg.value}`, { x: lx + 0.24, y: 5.06, w: 3.2, h: 0.32, fontSize: 11, color: hx(p.muted), fontFace: FONT })
      lx += 3.5
    })
  }
}

/** Build a dual-theme, two-band PPTX deck from a render-ready ExportModel. Returns the .pptx bytes. */
export async function buildPptx(model: ExportModel, theme: ExportTheme): Promise<ArrayBuffer> {
  const p: Palette = theme === 'dark' ? DARK : LIGHT
  const bg = hx(p.bg)

  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE'

  // Title slide
  const title = pptx.addSlide()
  title.background = { color: bg }
  title.addShape(pptx.ShapeType.rect, { x: M, y: 2.15, w: 1.2, h: 0.12, fill: { color: hx(p.accent) } })
  title.addText(model.title, { x: M, y: 2.45, w: CONTENT_W, h: 1.0, fontSize: 40, bold: true, color: hx(p.ink), fontFace: FONT })
  title.addText(`${model.customer} · ${model.subtitle}`, { x: M, y: 3.5, w: CONTENT_W, h: 0.5, fontSize: 16, color: hx(p.muted), fontFace: FONT })
  title.addText(model.footer, { x: M, y: 7.0, w: CONTENT_W, h: 0.3, fontSize: 9, color: hx(p.muted), fontFace: FONT })

  // Executive summary (full-width single)
  const exec = pptx.addSlide()
  exec.background = { color: bg }
  drawExec(exec, pptx, model, p)

  // Section slides via the pairing plan
  for (const item of planSlides(model.sections)) {
    const slide = pptx.addSlide()
    slide.background = { color: bg }
    if (item.kind === 'single') {
      drawIdle(slide, pptx, item.section, p)
    } else {
      drawSection(slide, pptx, item.top, BAND_TOP, p)
      slide.addShape(pptx.ShapeType.line, { x: M, y: DIVIDER_Y, w: CONTENT_W, h: 0, line: { color: hx(p.line), width: 1 } })
      if (item.bottom) drawSection(slide, pptx, item.bottom, BAND_BOTTOM, p)
    }
  }

  const out = await pptx.write({ outputType: 'arraybuffer' })
  return out as ArrayBuffer
}
```

- [ ] **Step 4: Run the smoke test + full suite**

Run: `npm run test:run -- src/engines/export`
Expected: PASS (builder smoke for both themes/flavors; buildExportModel; slidePlan). If `pptx.ShapeType.roundRect`/`rect`/`line` raise a type error, use the string forms (`'roundRect'`, `'rect'`, `'line'`) — pptxgenjs accepts both; adjust and re-run.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (If biome flags the unused `_i`/illustrative first `posture` block from Task 4, ensure that block was deleted.)

- [ ] **Step 6: Commit**

```bash
git add src/engines/export/pptx/builder.ts src/engines/export/pptx/builder.test.ts
git commit -m "feat(export): render graphical two-band PPTX deck"
```

---

### Task 6: Visual verification (render real decks) + tune

**Files:**
- No source changes unless a layout defect is found (then fix in `builder.ts` and re-commit).

- [ ] **Step 1: Add a throwaway render script**

Create `scripts/_deck-preview.mjs` (temporary; deleted in Step 4) that imports the built model+builder is not trivial from Node (ESM/TS). Instead, render from the **app**: run `npm run dev`, open the app, drop a sample workbook from `data/` (or `ref/`), and export PPTX in each theme × flavor.

Run: `npm run dev`
Then in the browser: load a sample, toggle theme (light/dark) and flavor (assessment/ops), and click **Export PPTX** for each combination (4 files).

- [ ] **Step 2: Convert exports to PDF and inspect**

Run (adjust filenames to the 4 exports in `~/Downloads`):

```bash
/opt/homebrew/bin/soffice --headless --convert-to pdf --outdir /tmp/deckcheck ~/Downloads/ppdm-report_*.pptx
```

Open the PDFs. Confirm for each: every slide carries a visual; no slide is more than ~⅓ empty; no data tables remain; idle shows the complete tile list; bars/cards don't overlap or overflow; light and dark both legible.

- [ ] **Step 3: Fix any layout defects**

If bars overflow, labels clip, or cards overlap, adjust the geometry constants/box sizes in `builder.ts` (`BAND_H`, `LABEL_W`, `CHART_X`, row/card heights) and re-export to confirm. Commit fixes:

```bash
git add src/engines/export/pptx/builder.ts
git commit -m "fix(export): tune deck band geometry from visual review"
```

- [ ] **Step 4: Remove any throwaway artifacts**

Ensure no preview script or exported files are staged. (`/tmp` and `~/Downloads` are outside the repo; nothing to clean in-tree.)

---

### Task 7: Final gates + PR

- [ ] **Step 1: Full verification**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all PASS (build runs the supply-chain gate via `prebuild`).

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/pptx-graphical-deck-redesign
gh pr create --title "Graphical two-band PPTX deck redesign" --body "Replaces the empty/tabular deck with chart-rich two-section horizontal-band slides (native shapes + one doughnut), both themes and flavors. HTML export unchanged (fast-follow). Spec: docs/superpowers/specs/2026-06-18-pptx-graphical-deck-redesign-design.md"
```

---

## Self-Review

**Spec coverage:**
- Two-band grammar, full-width exec + idle → Tasks 3 (planSlides) + 5 (builder). ✓
- All tables → charts → Task 4 emits bars/donut/tiles; builder renders only deck (no tables). ✓
- Native/editable vector, no images, no new deps → shapes + one doughnut; Global Constraints. ✓
- Both themes + flavors → builder palette switch; smoke test covers all four combos. ✓
- No new metrics → `capacity.flagged` reused; posture from `coverage.overall`; Global Constraints. ✓
- Per-section mapping (exec/coverage/gaps/jobs/compliance/capacity/policies/idle) → Task 4 covers each. ✓
- Idle complete/never truncated → `tiles: idleAgents` (no slice); test asserts full list. ✓
- Gaps top-10 + Excel note → Task 4 (`slice(0,10)` + `fullListInExcel`); test asserts cap + note. ✓
- Capped-window caveats preserved → existing `notes` retained and drawn at band bottom. ✓
- HTML untouched → additive `deck`; Global Constraints; no edits to `assembleHtml.ts`/its test. ✓

**Placeholder scan:** No TBD/TODO; all steps carry real code. The one illustrative-then-replaced `posture` block in Task 4 is explicitly flagged for deletion. ✓

**Type consistency:** `DeckBar{label,ratio,value,color}`, `DeckDonut{slices,center}`, `DeckStack{segments[]}`, `DeckSection{subtitle?,kpiChips?,donut?,bars?,tiles?}` used identically in Tasks 2, 4, 5. `planSlides`/`SlidePlanItem` signatures match between Tasks 3 and 5. `buildPptx(model,theme)` signature unchanged. ✓

**Deviations from spec (intentional, noted):** bars are shapes (not native chart objects) to keep value labels locale-formatted; capacity uses `flagged` tone-coloring instead of a threshold line (threshold value isn't in `ReportView`); the `surface` palette token already exists (no addition needed).
