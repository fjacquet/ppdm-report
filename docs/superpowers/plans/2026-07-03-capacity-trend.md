# Capacity Trend (PR 3 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the capacity-trend insight family — observed per-node utilization growth from Avamar's 366-day `Node Utilization` series (measurement only, no projection) — plus fix the live utilization-scale bug that renders JTI grids at "585%".

**Architecture:** One pure engine (`src/engines/aggregation/capacityTrend.ts`) computing per-target current/min/max/window/least-squares slope + a downsampled series; an Avamar adapter sharing a new scale-normalization helper with the existing `nodeTargets` (bug fix); a dashboard line chart via the one-ECharts-import rule (`LineChart` added to `Chart.tsx`, options built in `capacityTrendOption.ts`); an export section rendered table + bars (no line chart in PPTX/HTML — they are shape/CSS-drawn by design). NetWorker and PPDM stay provenance-unavailable (snapshot-only / no series).

**Tech Stack:** TypeScript, Vitest, React 19, ECharts (line), i18next ×4, Biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-insight-families-design.md` (family 3).

## Global Constraints

- Engines pure; no `Date.now()` (`Date.parse` on data-derived ISO days is fine).
- **Observed trend only**: slope reported as "pts per 30 days over the window" — never a days-to-full projection. The i18n copy must say "observed" / "not a projection".
- **Scale heuristic (binding, fixes a live bug):** Avamar `Max Utilization (%)` is a 0..1 RATIO in some exports (CRAMIF: 0.92) and PERCENT in others (all JTI grids: 5.85–27.69). Per sheet: if the maximum present value ≤ 1, multiply all by 100; else use as-is. Both the existing `nodeTargets` (capacity section) and the new trend adapter MUST use the shared helper.
- Slope requires ≥ **30** samples; series downsampled to ≤ **120** points (always keeping the last). Tone: slope ≥ **1.0** pt/30d AND current ≥ **60%** → bad; slope ≥ 1.0 → warn; else ok.
- Presence-gate every cell read (`cellStr !== ''`) before it enters computation.
- i18n ×4 (`keyParity`); Biome (authoritative: `./node_modules/.bin/biome check .`, never `npm run lint`); `makeWorkbook({})` throws (use Details-only workbook for absent-sheet tests); commit per green task.

---

### Task 0: Branch

- [ ] `git checkout main && git pull && git checkout -b feat/capacity-trend`

---

### Task 1: Engine — `computeCapacityTrend`

**Files:** Create `src/engines/aggregation/capacityTrend.ts`; Test `src/engines/aggregation/capacityTrend.test.ts`

**Interfaces (later tasks rely on exact names):**
- `interface UtilizationSample { day: string; target: string; pct: number }` (`day` = 'YYYY-MM-DD')
- `interface TrendTarget { target: string; currentPct: number; minPct: number; maxPct: number; windowStart: string; windowEnd: string; sampleCount: number; slopePer30d?: number; series: [string, number][] }`
- `interface CapacityTrend { targets: TrendTarget[] }`
- `emptyCapacityTrend(): CapacityTrend` → `{ targets: [] }`
- `computeCapacityTrend(samples: UtilizationSample[]): CapacityTrend`
- `MIN_SAMPLES_FOR_SLOPE = 30`, `MAX_SERIES_POINTS = 120` (exported consts)

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { computeCapacityTrend, emptyCapacityTrend, type UtilizationSample } from './capacityTrend'

/** n daily samples from 2026-01-01, pct via fn(i). */
const daily = (target: string, n: number, pct: (i: number) => number): UtilizationSample[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse('2026-01-01') + i * 86_400_000)
    return { target, day: d.toISOString().slice(0, 10), pct: pct(i) }
  })

describe('computeCapacityTrend', () => {
  it('flat series → slope ~0; current/min/max/window correct', () => {
    const t = computeCapacityTrend(daily('g/0', 60, () => 40)).targets[0]
    expect(t?.currentPct).toBe(40)
    expect(t?.minPct).toBe(40)
    expect(t?.maxPct).toBe(40)
    expect(t?.sampleCount).toBe(60)
    expect(t?.windowStart).toBe('2026-01-01')
    expect(t?.slopePer30d).toBeCloseTo(0, 6)
  })

  it('rising series: +0.1 pt/day → slope ≈ 3 pts per 30 days', () => {
    const t = computeCapacityTrend(daily('g/0', 90, (i) => 10 + i * 0.1)).targets[0]
    expect(t?.slopePer30d).toBeCloseTo(3, 3)
    expect(t?.currentPct).toBeCloseTo(18.9, 3)
  })

  it('noisy series still recovers the underlying slope direction', () => {
    const t = computeCapacityTrend(
      daily('g/0', 90, (i) => 20 + i * 0.05 + (i % 2 === 0 ? 0.4 : -0.4)),
    ).targets[0]
    expect(t?.slopePer30d).toBeGreaterThan(1)
    expect(t?.slopePer30d).toBeLessThan(2)
  })

  it('short series (< 30 samples) reports values but no slope', () => {
    const t = computeCapacityTrend(daily('g/0', 10, (i) => i)).targets[0]
    expect(t?.currentPct).toBe(9)
    expect(t?.slopePer30d).toBeUndefined()
  })

  it('multiple targets stay separate and sorted by name; series downsampled to ≤ 120 keeping the last point', () => {
    const r = computeCapacityTrend([
      ...daily('b/1', 366, (i) => i / 10),
      ...daily('a/0', 40, () => 50),
    ])
    expect(r.targets.map((t) => t.target)).toEqual(['a/0', 'b/1'])
    const b = r.targets[1]
    expect(b?.series.length).toBeLessThanOrEqual(120)
    expect(b?.series[b.series.length - 1]?.[0]).toBe(b?.windowEnd)
  })

  it('unsorted input is sorted by day; empty input → empty targets', () => {
    const t = computeCapacityTrend([
      { target: 'g/0', day: '2026-01-03', pct: 3 },
      { target: 'g/0', day: '2026-01-01', pct: 1 },
      { target: 'g/0', day: '2026-01-02', pct: 2 },
    ]).targets[0]
    expect(t?.windowStart).toBe('2026-01-01')
    expect(t?.currentPct).toBe(3)
    expect(emptyCapacityTrend().targets).toEqual([])
    expect(computeCapacityTrend([]).targets).toEqual([])
  })
})
```

- [ ] **Step 2: Run → FAIL (module missing). Step 3: Implement**

```ts
/** Observed utilization trend per target. Measurement only — no projection anywhere. */

export interface UtilizationSample {
  day: string
  target: string
  pct: number
}

export interface TrendTarget {
  target: string
  currentPct: number
  minPct: number
  maxPct: number
  windowStart: string
  windowEnd: string
  sampleCount: number
  /** Least-squares slope in percentage points per 30 days; undefined below MIN_SAMPLES_FOR_SLOPE. */
  slopePer30d?: number
  /** Downsampled [day, pct] pairs for the line chart (last point always kept). */
  series: [string, number][]
}

export interface CapacityTrend {
  targets: TrendTarget[]
}

export const MIN_SAMPLES_FOR_SLOPE = 30
export const MAX_SERIES_POINTS = 120
const MS_PER_DAY = 86_400_000

export function emptyCapacityTrend(): CapacityTrend {
  return { targets: [] }
}

/** Least-squares slope of pct over days-since-start, scaled to 30 days. */
function slopeOf(points: [string, number][]): number {
  const x0 = Date.parse(points[0]?.[0] ?? '')
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  const n = points.length
  for (const [day, pct] of points) {
    const x = (Date.parse(day) - x0) / MS_PER_DAY
    sx += x
    sy += pct
    sxx += x * x
    sxy += x * pct
  }
  const denom = n * sxx - sx * sx
  return denom === 0 ? 0 : ((n * sxy - sx * sy) / denom) * 30
}

function downsample(points: [string, number][]): [string, number][] {
  if (points.length <= MAX_SERIES_POINTS) return points
  const step = Math.ceil(points.length / MAX_SERIES_POINTS)
  const out: [string, number][] = []
  for (let i = 0; i < points.length; i += step) {
    const p = points[i]
    if (p) out.push(p)
  }
  const last = points[points.length - 1]
  if (last && out[out.length - 1] !== last) out.push(last)
  return out
}

/** Group samples per target, sort by day, derive window stats + observed slope. Pure. */
export function computeCapacityTrend(samples: UtilizationSample[]): CapacityTrend {
  const byTarget = new Map<string, [string, number][]>()
  for (const s of samples) {
    if (!s.target || !s.day) continue
    const list = byTarget.get(s.target) ?? []
    list.push([s.day, s.pct])
    byTarget.set(s.target, list)
  }
  const targets: TrendTarget[] = [...byTarget.entries()]
    .map(([target, points]) => {
      points.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      const pcts = points.map((p) => p[1])
      const first = points[0] as [string, number]
      const last = points[points.length - 1] as [string, number]
      return {
        target,
        currentPct: last[1],
        minPct: Math.min(...pcts),
        maxPct: Math.max(...pcts),
        windowStart: first[0],
        windowEnd: last[0],
        sampleCount: points.length,
        slopePer30d: points.length >= MIN_SAMPLES_FOR_SLOPE ? slopeOf(points) : undefined,
        series: downsample(points),
      }
    })
    .sort((a, b) => a.target.localeCompare(b.target))
  return { targets }
}
```

- [ ] **Step 4: PASS (6). Step 5: gate + commit** `feat(capacity-trend): pure trend engine — window stats + observed least-squares slope`

---

### Task 2: `mergeCapacityTrend`

**Files:** append to `capacityTrend.ts` + test.

- [ ] Tests: identity-by-reference on single element; two-server merge concatenates targets re-sorted by name; empty list → `emptyCapacityTrend()`.

```ts
describe('mergeCapacityTrend', () => {
  it('identity on one element; concat + resort across servers', () => {
    const a = computeCapacityTrend(daily('serverB/0', 40, () => 10))
    const b = computeCapacityTrend(daily('serverA/0', 40, () => 20))
    expect(mergeCapacityTrend([a])).toBe(a)
    const m = mergeCapacityTrend([a, b])
    expect(m.targets.map((t) => t.target)).toEqual(['serverA/0', 'serverB/0'])
    expect(mergeCapacityTrend([]).targets).toEqual([])
  })
})
```

- [ ] Implementation (append):

```ts
/** Fold per-server trends: targets are server-prefixed, so a plain concat + resort suffices. */
export function mergeCapacityTrend(list: CapacityTrend[]): CapacityTrend {
  const first = list[0]
  if (!first) return emptyCapacityTrend()
  if (list.length === 1) return first
  return {
    targets: list
      .flatMap((c) => c.targets)
      .sort((a, b) => a.target.localeCompare(b.target)),
  }
}
```

- [ ] Gate + commit `feat(capacity-trend): mergeCapacityTrend estate fold`

---

### Task 3: Wiring (ReportView / provenance / mergeViews / defaults)

Same mechanical pattern as families 1–2 (their commits are the template):
- `MetricKey` gains `'capacityTrend'`; `ReportView.capacityTrend: CapacityTrend` (non-optional, after `efficiency`; type-only import).
- Provenance factories: `avamarProvenance(..., capacityTrendAvailable: boolean)` appended; `networkerProvenance(...)` gains the param but callers pass `false` permanently (snapshot only — add comment `// NetWorker has no utilization time series — snapshot only.`); `allAvailable`/`allUnavailable` hard-code unavailable with `// PPDM capacity-trend wiring is a follow-up — unavailable for now.`
- `mergeViews`: `'capacityTrend'` in `mergeProvenance` keys + `capacityTrend: mergeCapacityTrend(views.map((v) => v.capacityTrend))`.
- Compiler-driven sweep: every ReportView literal gets `capacityTrend: emptyCapacityTrend(),`; Avamar builder passes `false` with `// capacity-trend wiring lands in the next task` marker.
- Gates: typecheck, biome, `npx vitest run src/engines/aggregation src/components/dashboard`, full `test:run`. Commit `feat(capacity-trend): ReportView.capacityTrend + provenance key + estate merge`.

---

### Task 4: Avamar adapter + utilization-scale bug fix

**Files:** Create `src/engines/products/avamar/capacityTrend.ts`; Modify `src/engines/products/avamar/buildAvamarView.ts`; Tests for both.

- [ ] **Step 1: shared scale helper** in the new file:

```ts
import type { Cell, RawWorkbook } from '../../../types/ppdm'
import {
  computeCapacityTrend,
  type CapacityTrend,
  type UtilizationSample,
} from '../../aggregation/capacityTrend'
import { cellNum, cellStr } from '../../aggregation/rows'
import { serialToIso } from '../../parser/serialToIso'

/**
 * Avamar's `Max Utilization (%)` column is a 0..1 RATIO in some exports (e.g. 0.92)
 * and a plain PERCENT in others (e.g. 5.85 … 27.69). Per sheet: when every present
 * value is ≤ 1 the sheet is ratio-scaled → ×100; otherwise values are already percent.
 */
export function utilizationScaleFactor(rows: Record<string, Cell>[]): number {
  let max = Number.NEGATIVE_INFINITY
  for (const r of rows) {
    if (cellStr(r, 'Max Utilization (%)') === '') continue
    const v = cellNum(r, 'Max Utilization (%)')
    if (v > max) max = v
  }
  return max > 1 ? 1 : 100
}

/** Per-node utilization time series → observed trend. Pure. */
export function avamarCapacityTrend(wb: RawWorkbook): CapacityTrend {
  const rows = wb.sheets['Node Utilization']?.rows ?? []
  const scale = utilizationScaleFactor(rows)
  const prefix = wb.meta.customer || 'Avamar'
  const samples: UtilizationSample[] = []
  for (const r of rows) {
    if (cellStr(r, 'Max Utilization (%)') === '' || cellStr(r, 'Date') === '') continue
    const serial = cellNum(r, 'Date')
    if (serial <= 0) continue
    samples.push({
      target: `${prefix} / node ${cellStr(r, 'Node')}`,
      day: serialToIso(serial).slice(0, 10),
      pct: cellNum(r, 'Max Utilization (%)') * scale,
    })
  }
  return computeCapacityTrend(samples)
}
```

- [ ] **Step 2: fix the live bug** — in `buildAvamarView.ts`'s `nodeTargets`, replace the unconditional `* 100` with the shared factor: import `utilizationScaleFactor` and compute `const scale = utilizationScaleFactor(rows)` once, then `const util = cellNum(r, 'Max Utilization (%)') * scale`. Update the function's comment to describe the dual-scale reality. Wire `capacityTrend: avamarCapacityTrend(wb)` and flip the provenance arg to `avamarCapacityTrend(wb).targets.length > 0` — compute the trend ONCE into a const and reuse for both.
- [ ] **Step 3: tests** (`src/engines/products/avamar/capacityTrend.test.ts`):

```ts
describe('avamarCapacityTrend + utilizationScaleFactor', () => {
  it('percent-scale sheet (values > 1) is used as-is', () => {
    const r = avamarCapacityTrend(
      wb({
        Details: [['Project Name', 'GERTRI01']],
        'Node Utilization': [
          ['Date', 'Node', 'Max Utilization (%)'],
          [45839, 0, 5.85],
          [45840, 0, 10.62],
        ],
      }),
    )
    expect(r.targets[0]?.target).toBe('GERTRI01 / node 0')
    expect(r.targets[0]?.currentPct).toBeCloseTo(10.62, 6)
  })

  it('ratio-scale sheet (all values ≤ 1) is multiplied by 100', () => {
    const r = avamarCapacityTrend(
      wb({
        'Node Utilization': [
          ['Date', 'Node', 'Max Utilization (%)'],
          [45839, 0, 0.9],
          [45840, 0, 0.92],
        ],
      }),
    )
    expect(r.targets[0]?.currentPct).toBeCloseTo(92, 6)
  })
})
```

Also EXTEND the existing buildAvamarView test file with a regression case: a percent-scale Node Utilization sheet yields `capacity.targets[0].utilizationPct ≈ 10.62` (not 1062).
- [ ] Gates incl. full `test:run` (the CRAMIF-convention ratio tests must stay green). Commit `fix(avamar): dual-scale node utilization + feat(capacity-trend): Avamar adapter`

---

### Task 5: Threshold

Append to `thresholds.ts` + test:

```ts
/** Observed utilization growth: slope in pts per 30 days, paired with current level (0..100). */
export function capacityTrendTone(slopePer30d: number, currentPct: number): ExportTone {
  if (slopePer30d >= 1 && currentPct >= 60) return 'bad'
  if (slopePer30d >= 1) return 'warn'
  return 'ok'
}
```

Tests: (0.9,90)→ok, (1,59.9)→warn, (1,60)→bad. Commit `feat(capacity-trend): growth tone threshold`.

---

### Task 6: i18n ×4

`dashboard.json`, block `capacityTrend` inserted after `efficiency` in all four locales:

en: `{"title":"Capacity growth","takeaway":"Fastest-growing target: {{target}} at {{slope}} pts/month","takeawayFlat":"No target shows meaningful growth over the window","chip":"Fastest growth","col":{"target":"Target","current":"Current","min":"Min","max":"Max","slope":"Growth (pts/30 d)","window":"Window"},"noSlope":"n/a","observedNote":"Observed trend over the collection window — not a projection.","chartLabel":"Utilization over time (%)"}`

fr: `{"title":"Croissance de la capacité","takeaway":"Cible à plus forte croissance : {{target}} à {{slope}} pts/mois","takeawayFlat":"Aucune cible ne montre de croissance significative sur la période","chip":"Croissance la plus rapide","col":{"target":"Cible","current":"Actuel","min":"Min","max":"Max","slope":"Croissance (pts/30 j)","window":"Période"},"noSlope":"n/d","observedNote":"Tendance observée sur la période de collecte — pas une projection.","chartLabel":"Utilisation dans le temps (%)"}`

de: `{"title":"Kapazitätswachstum","takeaway":"Am schnellsten wachsendes Ziel: {{target}} mit {{slope}} Pkt./Monat","takeawayFlat":"Kein Ziel zeigt nennenswertes Wachstum im Zeitfenster","chip":"Schnellstes Wachstum","col":{"target":"Ziel","current":"Aktuell","min":"Min","max":"Max","slope":"Wachstum (Pkt./30 T)","window":"Zeitfenster"},"noSlope":"k. A.","observedNote":"Beobachteter Trend im Erfassungszeitraum — keine Projektion.","chartLabel":"Auslastung im Zeitverlauf (%)"}`

it: `{"title":"Crescita della capacità","takeaway":"Target con crescita più rapida: {{target}} a {{slope}} pt/mese","takeawayFlat":"Nessun target mostra una crescita significativa nel periodo","chip":"Crescita più rapida","col":{"target":"Target","current":"Attuale","min":"Min","max":"Max","slope":"Crescita (pt/30 g)","window":"Periodo"},"noSlope":"n/d","observedNote":"Tendenza osservata nel periodo di raccolta — non una proiezione.","chartLabel":"Utilizzo nel tempo (%)"}`

Gate: keyParity. Commit `feat(capacity-trend): i18n strings en/fr/de/it`.

---

### Task 7: Dashboard — line chart + section

**Files:** Modify `src/components/Chart.tsx` (add `LineChart` to the `echarts/charts` import and the `echarts.use([...])` list — ONLY change); Create `src/components/dashboard/capacityTrendOption.ts` + `CapacityTrendSection.tsx`; Modify `Dashboard.tsx`; tests in `sections.test.tsx` + a small `capacityTrendOption.test.ts`.

- `capacityTrendOption(targets: TrendTarget[]): EChartsOption` (pure, mirroring `barOption.ts` style): one `line` series per target (`showSymbol: false`, `data: t.series`), `xAxis: { type: 'category' }` fed the day strings of the longest series (or use `type: 'time'` with [day, pct] pairs — implementer picks whichever the existing theme handles cleanly; assert in the unit test that series count and data lengths match input), `yAxis` 0–100 with a `markLine` at 80 on the first series (current-state marker, label `'80%'`).
- `CapacityTrendSection({ view, dark })`: null when `view.capacityTrend.targets.length === 0`; h2 title, takeaway (fastest slope target via `capacityTrend.takeaway`, or `takeawayFlat` when no target has `slopePer30d ≥ 1`), `<Chart option={...} dark={dark} testId="capacity-trend-chart" ariaLabel={t('capacityTrend.chartLabel')} />` (charts are decorative per repo convention — follow AtRisk/Coverage section patterns for aria), then a table: target / current / min / max / slope (fmtNum 1 decimal, `noSlope` when undefined) / window. Percent cells via the repo's percent-value formatter for 0..100 values.
- `Dashboard.tsx`: `case 'capacityTrend': return <CapacityTrendSection key={id} view={view} dark={dark} />`.
- Tests: section renders target name + slope; renders nothing when empty; option builder returns one series per target.
- Gates + full test:run. Commit `feat(capacity-trend): dashboard line chart + section`.

---

### Task 8: Export section

- `sectionOrder.ts`: `'capacityTrend'` in union; insert immediately after `'capacity'` (before `'efficiency'`) in BOTH flavors.
- `buildExportModel.ts`: section id `'capacityTrend'`, registered `withCaveat(..., 'capacityTrend', view, t)`:
  - table: one row per target — target, current %, min %, max %, slope (`fmtNum(slope,1)` or `noSlope`), window (`start – end`); caption = `observedNote`.
  - chips: fastest-growing target (`capacityTrend.chip`, value `+{slope} pts`, tone `capacityTrendTone(slope, current)`) when any slope defined.
  - deck: subtitle = takeaway/takeawayFlat; kpiChips as above; bars = per-target current utilization (`ratio: currentPct/100`, value `{pct} % · +{slope}/30d`, tone from `utilizationTone(currentPct)`).
  - No FULLWIDTH entry (band + auto appendix table, established precedent). No line chart in exports (PPTX/HTML are shape/CSS-drawn; the dashboard carries the chart).
- Tests: section present with real targets (chip + bars + table row), suppressed when `emptyCapacityTrend()` (PPDM/NetWorker).
- Gates + full test:run. Commit `feat(capacity-trend): export section — growth table, chips, utilization bars`.

---

### Task 9: Gates, smoke, PR

- [ ] Full CI sequence (`typecheck`, biome, `test:run`, `build`).
- [ ] Engine smoke (tsx script pattern): ingest GERTRI01-AVN106 + POLGST01-AVN104 + SWIGVA01-AVU203, print per-target current/min/max/slope. Expected: GERTRI ≈ 5.85→10.62 (slope ≈ +0.4 pts/30d), POLGST ≈ 20.6→27.7 (+0.6), AVU203 ≈ 15.4→16.5 (flat-ish); all currents now sane percentages (scale-bug fix verified on real data).
- [ ] Push `feat/capacity-trend`; PR body: family 3 + the utilization-scale bug fix called out; note "observed trend only, no projection" framing; follow-ups (PPDM series n/a, NetWorker snapshot-only).

## Out of scope

- Any forecast/projection. NetWorker/PPDM trend sources. Line charts in PPTX/HTML exports.
