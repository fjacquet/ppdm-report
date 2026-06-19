# Graphical Dashboard — Chart-Led Sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution uses **sonnet-tier** subagents.

**Goal:** Bring the on-screen dashboard up to the exports' chart grammar — gaps/jobs/compliance/capacity/policies become ECharts bar charts, idle becomes a tile grid, and each detail table moves behind a collapsible "Show details" disclosure.

**Architecture:** Reuse the existing ECharts `<Chart>` component (as `CoverageSection` already does) driven by a new pure `horizontalBarOption` helper; add a tiny native-`<details>` `Details` component. Each section keeps its KPIs, adds a (decorative) chart, and wraps its existing table in `Details`. The `dark` flag (already computed in `Dashboard`) is threaded to the four chart sections.

**Tech Stack:** React 19, TypeScript, ECharts (already a dependency; `BarChart`/`PieChart` registered in `src/components/Chart.tsx`), Tailwind, vitest + @testing-library/react, biome, i18next (en/fr/de/it).

## Global Constraints

- **Dashboard only.** Do NOT touch the export engines (`src/engines/export/**`) or `assembleHtml`/`pptx/builder`.
- **No new dependency** — `package.json` unchanged; ECharts `BarChart` is already registered in `Chart.tsx`.
- **No new `ReportView` metrics** — read existing fields only (`capacity.flagged` already exists for the warn colour).
- **Colours from the active palette** (`DARK`/`LIGHT` in `src/theme/palette.ts`: `ok, warn, bad, accent, muted, excluded, surface, line, ink, bg`).
- **Both themes** — every chart receives the `dark` prop; the `<Chart>` component applies the `midnight-light`/`midnight-dark` ECharts theme.
- **Accessibility:** dashboard charts are **decorative** (`aria-hidden`, no `aria-label`); the data is exposed as text via the KPIs and the accessible `<details>` tables. Charts are targeted in tests by **`data-testid`**, never by role/label.
- **i18n parity** — the one new key (`common:showDetails`) must exist in all four locales (`src/i18n/keyParity.test.ts` must stay green).
- **Fonts:** Arial (already set at the dashboard root).
- **Gates:** `npm run typecheck`, `npm run lint`, `npm run test:run` pass after every task; commit after each.
- **Test nuance:** ECharts SVG renders category labels into the DOM in jsdom, so a label shown on the chart axis AND in the Details table appears **twice** — assert such content with `getAllByText` (length ≥ 1) or scope via `within(...)`. Assert chart presence with `getByTestId('…')`. KPI values (unique) keep `getByText`.

---

### Task 1: Add the `common:showDetails` i18n key (all four locales)

**Files:**
- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/fr/common.json`, `src/i18n/locales/de/common.json`, `src/i18n/locales/it/common.json`
- Test: `src/i18n/keyParity.test.ts` (existing — must stay green)

**Interfaces:**
- Produces: i18n key `common:showDetails`.

- [ ] **Step 1: Add the key to each common catalog**

Add a top-level `"showDetails"` key to each `*/common.json`:
- `en`: `"showDetails": "Show details"`
- `fr`: `"showDetails": "Afficher les détails"`
- `de`: `"showDetails": "Details anzeigen"`
- `it`: `"showDetails": "Mostra dettagli"`

- [ ] **Step 2: Verify parity**

Run: `npm run test:run -- src/i18n/keyParity.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales
git commit -m "i18n: add common:showDetails key (en/fr/de/it)"
```

---

### Task 2: `Details` disclosure component (TDD)

**Files:**
- Create: `src/components/Details.tsx`
- Test: `src/components/Details.test.tsx`

**Interfaces:**
- Produces: `Details({ summary, children }: { summary: string; children: ReactNode }): JSX.Element` — a styled native `<details>` (collapsed by default; `<summary>` shows `summary`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/Details.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Details } from './Details'

describe('Details', () => {
  afterEach(() => cleanup())

  it('renders the summary label and is collapsed by default', () => {
    render(
      <Details summary="Show details">
        <p>secret row</p>
      </Details>,
    )
    expect(screen.getByText('Show details')).toBeInTheDocument()
    const details = screen.getByText('Show details').closest('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('keeps children in the DOM (so they are testable even when collapsed)', () => {
    render(
      <Details summary="Show details">
        <p>secret row</p>
      </Details>,
    )
    expect(screen.getByText('secret row')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/components/Details.test.tsx`
Expected: FAIL — `Details` not found.

- [ ] **Step 3: Implement `Details`**

```tsx
// src/components/Details.tsx
import type { ReactNode } from 'react'

/** Collapsible drill-down built on the native <details> element (accessible, no JS state). */
export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer select-none text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/components/Details.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `npm run typecheck && ./node_modules/.bin/biome check src/components/Details.tsx src/components/Details.test.tsx`

```bash
git add src/components/Details.tsx src/components/Details.test.tsx
git commit -m "feat(dashboard): add Details disclosure component"
```

---

### Task 3: `horizontalBarOption` chart helper (TDD)

**Files:**
- Create: `src/components/dashboard/barOption.ts`
- Test: `src/components/dashboard/barOption.test.ts`

**Interfaces:**
- Consumes: `Palette` from `../../theme/palette`.
- Produces:
  ```ts
  export interface BarDatum { label: string; value: number; valueText: string; color: string }
  export function horizontalBarOption(data: BarDatum[], palette: Palette, max?: number | 'dataMax'): EChartsOption
  ```
  Largest-first (top), per-bar colour, localized value label at the bar end via a `formatter` closure over `data`. `max` defaults to `'dataMax'` (relative); pass `1` for 0..1 ratios, `100` for 0..100 %.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/dashboard/barOption.test.ts
import { describe, expect, it } from 'vitest'
import { LIGHT } from '../../theme/palette'
import { type BarDatum, horizontalBarOption } from './barOption'

const data: BarDatum[] = [
  { label: 'A', value: 90, valueText: '90 %', color: '#111111' },
  { label: 'B', value: 40, valueText: '40 %', color: '#222222' },
]

describe('horizontalBarOption', () => {
  it('maps labels to a category y-axis in order', () => {
    const opt = horizontalBarOption(data, LIGHT)
    // biome-ignore lint/suspicious/noExplicitAny: ECharts option shape is loosely typed
    expect((opt.yAxis as any).data).toEqual(['A', 'B'])
  })

  it('colors each bar from its datum', () => {
    const opt = horizontalBarOption(data, LIGHT)
    // biome-ignore lint/suspicious/noExplicitAny: ECharts series shape is loosely typed
    const series = (opt.series as any[])[0]
    expect(series.data[0].itemStyle.color).toBe('#111111')
    expect(series.data[1].itemStyle.color).toBe('#222222')
  })

  it('labels each bar end with its localized valueText', () => {
    const opt = horizontalBarOption(data, LIGHT)
    // biome-ignore lint/suspicious/noExplicitAny: ECharts label formatter is loosely typed
    const formatter = (opt.series as any[])[0].label.formatter as (p: { dataIndex: number }) => string
    expect(formatter({ dataIndex: 0 })).toBe('90 %')
    expect(formatter({ dataIndex: 1 })).toBe('40 %')
  })

  it('honors an absolute max for ratio/percent bars', () => {
    const opt = horizontalBarOption(data, LIGHT, 100)
    // biome-ignore lint/suspicious/noExplicitAny: ECharts axis shape is loosely typed
    expect((opt.xAxis as any).max).toBe(100)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/components/dashboard/barOption.test.ts`
Expected: FAIL — `horizontalBarOption` not found.

- [ ] **Step 3: Implement the helper**

```ts
// src/components/dashboard/barOption.ts
import type { EChartsOption } from 'echarts/types/dist/shared'
import type { Palette } from '../../theme/palette'

export interface BarDatum {
  /** y-axis category label */
  label: string
  /** bar magnitude */
  value: number
  /** already-localized end label, e.g. "11.0 TB", "87.6 %", "9,297" */
  valueText: string
  /** bar colour (palette tone hex, with '#') */
  color: string
}

/**
 * Horizontal bar chart mirroring the deck: category labels, hidden value axis,
 * per-bar colours, localized value labels at the bar end, largest first.
 * `max` defaults to 'dataMax' (bars relative to the largest); pass a number for
 * absolute scaling (1 for 0..1 ratios, 100 for 0..100 percentages).
 */
export function horizontalBarOption(
  data: BarDatum[],
  palette: Palette,
  max: number | 'dataMax' = 'dataMax',
): EChartsOption {
  return {
    grid: { containLabel: true, left: 8, right: 56, top: 8, bottom: 8 },
    xAxis: { type: 'value', show: false, max },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((d) => d.label),
      axisLabel: { color: palette.ink, overflow: 'truncate', width: 150 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        barWidth: '55%',
        data: data.map((d) => ({ value: d.value, itemStyle: { color: d.color, borderRadius: 3 } })),
        label: {
          show: true,
          position: 'right',
          color: palette.ink,
          fontSize: 12,
          fontWeight: 'bold',
          formatter: (p: { dataIndex: number }) => data[p.dataIndex]?.valueText ?? '',
        },
      },
    ],
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/components/dashboard/barOption.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `npm run typecheck && ./node_modules/.bin/biome check src/components/dashboard/barOption.ts src/components/dashboard/barOption.test.ts`

```bash
git add src/components/dashboard/barOption.ts src/components/dashboard/barOption.test.ts
git commit -m "feat(dashboard): horizontalBarOption chart helper"
```

---

### Task 4: `Chart` — decorative by default + `testId`; harmonize CoverageSection

**Files:**
- Modify: `src/components/Chart.tsx`
- Modify: `src/components/dashboard/CoverageSection.tsx`
- Test: `src/components/dashboard/sections.test.tsx` (CoverageSection describe block)

**Interfaces:**
- Produces: `<Chart option dark style? ariaLabel? testId? />` — when `ariaLabel` is omitted the chart renders `aria-hidden="true"` (decorative); `testId` is always applied as `data-testid`. Consumed by Tasks 5–8.

- [ ] **Step 1: Update `Chart.tsx` props + returned element**

In `src/components/Chart.tsx`, add `testId` to the props interface and the destructure, and change the returned `<div>`:

```tsx
export interface ChartProps {
  option: EChartsOption
  dark: boolean
  style?: CSSProperties
  ariaLabel?: string
  testId?: string
}

function ChartImpl({ option, dark, style, ariaLabel, testId }: ChartProps) {
```

and the return:

```tsx
  return (
    <div
      ref={containerRef}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      data-testid={testId}
      style={style ?? { minHeight: 320, width: '100%' }}
    />
  )
```

- [ ] **Step 2: Harmonize `CoverageSection`** — replace its two `ariaLabel` props with `testId` (decorative). In `src/components/dashboard/CoverageSection.tsx` change the two `<Chart>` usages to:

```tsx
        <Chart
          option={donutOption}
          dark={dark}
          testId="coverage-donut"
          style={{ minHeight: 240, width: '100%', flex: '0 0 240px' }}
        />
        {typeNames.length > 0 && (
          <Chart
            option={barOption}
            dark={dark}
            testId="coverage-bars"
            style={{ minHeight: barHeight, width: '100%' }}
          />
        )}
```

- [ ] **Step 3: Update the CoverageSection test** — replace the `renders aria-label on the donut chart` test in `sections.test.tsx` with:

```tsx
  it('renders the donut chart (decorative, found by testid)', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    expect(screen.getByTestId('coverage-donut')).toBeInTheDocument()
  })
```

- [ ] **Step 4: Run + gates**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t Coverage`
Expected: PASS.
Run: `npm run typecheck && ./node_modules/.bin/biome check src/components/Chart.tsx src/components/dashboard/CoverageSection.tsx src/components/dashboard/sections.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/Chart.tsx src/components/dashboard/CoverageSection.tsx src/components/dashboard/sections.test.tsx
git commit -m "refactor(dashboard): decorative charts via testId; data lives in KPIs + tables"
```

---

### Task 5: GapsSection → bars + collapsible table

**Files:**
- Modify: `src/components/dashboard/GapsSection.tsx`, `src/components/dashboard/Dashboard.tsx` (one line)
- Test: `src/components/dashboard/sections.test.tsx` (GapsSection describe block)

**Interfaces:**
- Consumes: `horizontalBarOption`/`BarDatum` (Task 3), `Details` (Task 2), `Chart` with `testId` (Task 4).
- Produces: `GapsSection({ view, dark }: { view: ReportView; dark: boolean })` (adds the `dark` prop).

- [ ] **Step 1: Update the GapsSection tests**

Replace the `GapsSection` describe block in `src/components/dashboard/sections.test.tsx` with:

```tsx
describe('GapsSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders the two KPIs', () => {
    render(<GapsSection view={gapsFixture} dark={false} />)
    expect(screen.getByText('263.0 TB')).toBeInTheDocument()
    expect(screen.getAllByText('281').length).toBeGreaterThan(0)
  })

  it('renders the unprotected-by-size bar chart', () => {
    render(<GapsSection view={gapsFixture} dark={false} />)
    expect(screen.getByTestId('gaps-bars')).toBeInTheDocument()
  })

  it('keeps the full list behind a Show details disclosure (asset name + caption present)', () => {
    render(<GapsSection view={gapsFixture} dark={false} />)
    expect(screen.getByText('Show details')).toBeInTheDocument()
    expect(screen.getAllByText('HR_PAYROLL_PROD').length).toBeGreaterThan(0)
    expect(screen.getByText('Top 1 of 281')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t Gaps`
Expected: FAIL — `GapsSection` does not accept `dark` / no `gaps-bars` testid.

- [ ] **Step 3: Implement GapsSection**

Full file content for `src/components/dashboard/GapsSection.tsx`:

```tsx
import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, formatBytes, gbToBytes } from '../../utils/format'
import { Chart } from '../Chart'
import { Details } from '../Details'
import { type BarDatum, horizontalBarOption } from './barOption'

interface GapsSectionProps {
  view: ReportView
  dark: boolean
}

export function GapsSection({ view, dark }: GapsSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT

  const totalBytes = gbToBytes(view.gaps.totalCapacityGb)
  const { top, count } = view.gaps

  const barData: BarDatum[] = useMemo(
    () =>
      top.items.slice(0, 10).map((a) => ({
        label: a.name,
        value: a.sizeGb,
        valueText: formatBytes(gbToBytes(a.sizeGb), locale),
        color: palette.bad,
      })),
    [top.items, locale, palette],
  )
  const barOption: EChartsOption = useMemo(() => horizontalBarOption(barData, palette), [barData, palette])
  const barHeight = Math.max(120, barData.length * 34)

  return (
    <section aria-label={t('dashboard:gaps.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:gaps.title')}
      </h2>

      {/* KPI row */}
      <div className="mb-4 flex gap-8">
        <div>
          <p className="text-3xl font-bold text-red-500">{formatBytes(totalBytes, locale)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('dashboard:gaps.unprotectedTb')}
          </p>
        </div>
        <div>
          <p className="text-3xl font-bold text-red-500">{fmtInt(count, locale)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard:gaps.assets')}</p>
        </div>
      </div>

      {barData.length > 0 && (
        <>
          <Chart
            option={barOption}
            dark={dark}
            testId="gaps-bars"
            style={{ minHeight: barHeight, width: '100%' }}
          />
          <Details summary={t('common:showDetails')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="pb-2 pr-4 font-medium">{t('common:col.name')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('common:col.type')}</th>
                    <th className="pb-2 font-medium text-right">{t('common:col.size')}</th>
                  </tr>
                </thead>
                <tbody>
                  {top.items.map((item, index) => (
                    <tr
                      key={`${item?.name}-${index}`}
                      className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                    >
                      <td className="py-1.5 pr-4">{item?.name}</td>
                      <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{item?.type}</td>
                      <td className="py-1.5 text-right">
                        {formatBytes(gbToBytes(item?.sizeGb ?? 0), locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                {t('common:topOf', { shown: top.shown, total: top.total })}
              </p>
            </div>
          </Details>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Thread `dark` from Dashboard**

In `src/components/dashboard/Dashboard.tsx`, change the gaps case:
```tsx
      case 'gaps':
        return <GapsSection key={id} view={view} dark={dark} />
```

- [ ] **Step 5: Run tests + gates**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t Gaps`
Expected: PASS.
Run: `npm run typecheck && ./node_modules/.bin/biome check src/components/dashboard/GapsSection.tsx src/components/dashboard/Dashboard.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/GapsSection.tsx src/components/dashboard/Dashboard.tsx src/components/dashboard/sections.test.tsx
git commit -m "feat(dashboard): gaps section as bar chart + collapsible table"
```

---

### Task 6: CapacitySection → bars + collapsible table

**Files:**
- Modify: `src/components/dashboard/CapacitySection.tsx`, `src/components/dashboard/Dashboard.tsx` (one line)
- Test: `src/components/dashboard/sections.test.tsx` (CapacitySection describe block)

**Interfaces:**
- Produces: `CapacitySection({ view, dark }: { view: ReportView; dark: boolean })`.

- [ ] **Step 1: Update the CapacitySection tests**

Replace the `CapacitySection` describe block with:

```tsx
describe('CapacitySection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders the mtree count', () => {
    render(<CapacitySection view={capacityFixture} dark={false} />)
    expect(screen.getByText(/17/)).toBeInTheDocument()
  })

  it('renders the utilization bar chart', () => {
    render(<CapacitySection view={capacityFixture} dark={false} />)
    expect(screen.getByTestId('capacity-bars')).toBeInTheDocument()
  })

  it('keeps the targets table behind Show details (name + utilization present)', () => {
    render(<CapacitySection view={capacityFixture} dark={false} />)
    expect(screen.getByText('Show details')).toBeInTheDocument()
    expect(screen.getAllByText('dd1').length).toBeGreaterThan(0)
    expect(screen.getByText('87.6 %')).toBeInTheDocument()
    const flaggedRow = document.querySelector('[data-flagged="true"]')
    expect(flaggedRow).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t Capacity`
Expected: FAIL.

- [ ] **Step 3: Implement CapacitySection**

Full file content for `src/components/dashboard/CapacitySection.tsx`:

```tsx
import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercentValue } from '../../utils/format'
import { Chart } from '../Chart'
import { Details } from '../Details'
import { type BarDatum, horizontalBarOption } from './barOption'

interface CapacitySectionProps {
  view: ReportView
  dark: boolean
}

export function CapacitySection({ view, dark }: CapacitySectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT
  const { capacity } = view

  const barData: BarDatum[] = useMemo(
    () =>
      capacity.targets
        .slice()
        .sort((a, b) => b.utilizationPct - a.utilizationPct)
        .map((tg) => ({
          label: tg.name,
          value: tg.utilizationPct,
          valueText: fmtPercentValue(tg.utilizationPct, locale),
          color: tg.flagged ? palette.warn : palette.accent,
        })),
    [capacity.targets, locale, palette],
  )
  // utilization is 0..100 → absolute scale (max 100), so 87.6% fills ~88% of the track
  const barOption: EChartsOption = useMemo(() => horizontalBarOption(barData, palette, 100), [barData, palette])
  const barHeight = Math.max(120, barData.length * 34)

  return (
    <section aria-label={t('capacity.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('capacity.title')}
      </h2>

      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {t('capacity.mtrees', { count: fmtInt(capacity.mtreeCount, locale) })}
      </p>

      {barData.length > 0 && (
        <>
          <Chart
            option={barOption}
            dark={dark}
            testId="capacity-bars"
            style={{ minHeight: barHeight, width: '100%' }}
          />
          <Details summary={t('common:showDetails')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="pb-2 pr-4 font-medium">{t('common:col.name')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('common:col.type')}</th>
                    <th className="pb-2 font-medium text-right">{t('capacity.utilization')}</th>
                  </tr>
                </thead>
                <tbody>
                  {capacity.targets.map((target) => {
                    const rowClass = target.flagged
                      ? 'border-b border-gray-100 dark:border-gray-800 text-amber-700 dark:text-amber-400'
                      : 'border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200'
                    return (
                      <tr key={target.name} className={rowClass} data-flagged={target.flagged || undefined}>
                        <td className="py-1.5 pr-4 font-medium">{target.name}</td>
                        <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{target.type}</td>
                        <td className="py-1.5 text-right">
                          {fmtPercentValue(target.utilizationPct, locale)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Details>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Thread `dark` from Dashboard**

In `Dashboard.tsx`:
```tsx
      case 'capacity':
        return <CapacitySection key={id} view={view} dark={dark} />
```

- [ ] **Step 5: Run tests + gates**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t Capacity`
Expected: PASS.
Run: `npm run typecheck && ./node_modules/.bin/biome check src/components/dashboard/CapacitySection.tsx src/components/dashboard/Dashboard.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/CapacitySection.tsx src/components/dashboard/Dashboard.tsx src/components/dashboard/sections.test.tsx
git commit -m "feat(dashboard): capacity section as utilization bars + collapsible table"
```

---

### Task 7: JobsComplianceSection → status bars + compliance bars + collapsible table

**Files:**
- Modify: `src/components/dashboard/JobsComplianceSection.tsx`, `src/components/dashboard/Dashboard.tsx` (one line)
- Test: `src/components/dashboard/sections.test.tsx` (JobsComplianceSection describe block)

**Interfaces:**
- Produces: `JobsComplianceSection({ view, dark }: { view: ReportView; dark: boolean })`.

- [ ] **Step 1: Update the JobsComplianceSection tests**

Replace the `JobsComplianceSection` describe block with:

```tsx
describe('JobsComplianceSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders the job success KPI "93%"', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.getByText('93%')).toBeInTheDocument()
  })

  it('renders the jobs result-mix and compliance bar charts', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.getByTestId('jobs-bars')).toBeInTheDocument()
    expect(screen.getByTestId('compliance-bars')).toBeInTheDocument()
  })

  it('keeps the status counts behind Show details', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.getByText('Show details')).toBeInTheDocument()
    expect(screen.getAllByText('SUCCESS').length).toBeGreaterThan(0)
  })

  it('renders both capped caveats', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.getAllByText(/window, not the full set/i).length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t JobsCompliance`
Expected: FAIL.

- [ ] **Step 3: Implement JobsComplianceSection**

Full file content for `src/components/dashboard/JobsComplianceSection.tsx`:

```tsx
import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { immutableTone } from '../../engines/export/tone'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercent } from '../../utils/format'
import { Chart } from '../Chart'
import { Details } from '../Details'
import { KpiCard } from '../KpiCard'
import { type BarDatum, horizontalBarOption } from './barOption'

interface JobsComplianceSectionProps {
  view: ReportView
  dark: boolean
}

export function JobsComplianceSection({ view, dark }: JobsComplianceSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT
  const { jobs, compliance } = view

  const jobColor: Record<string, string> = {
    SUCCESS: palette.ok,
    RETRIED: palette.warn,
    SKIPPED: palette.muted,
    CANCELED: palette.bad,
    FAILED: palette.bad,
  }

  const jobBars: BarDatum[] = useMemo(
    () =>
      Object.entries(jobs.counts).map(([status, n]) => ({
        label: status,
        value: n,
        valueText: fmtInt(n, locale),
        color: jobColor[status] ?? palette.accent,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs.counts, locale, palette],
  )
  const jobOption: EChartsOption = useMemo(() => horizontalBarOption(jobBars, palette), [jobBars, palette])
  const jobBarHeight = Math.max(110, jobBars.length * 30)

  const compBars: BarDatum[] = useMemo(
    () => [
      {
        label: t('dashboard:compliance.appConsistent'),
        value: compliance.appConsistentPct,
        valueText: fmtPercent(compliance.appConsistentPct, locale),
        color: palette.ok,
      },
      {
        label: t('dashboard:compliance.replicated'),
        value: compliance.replicatedPct,
        valueText: fmtPercent(compliance.replicatedPct, locale),
        color: palette.accent,
      },
      {
        label: t('dashboard:compliance.immutable'),
        value: compliance.immutablePct,
        valueText: fmtPercent(compliance.immutablePct, locale),
        color: immutableTone(compliance.immutablePct) === 'bad' ? palette.bad : palette.ok,
      },
    ],
    [compliance.appConsistentPct, compliance.replicatedPct, compliance.immutablePct, locale, palette, t],
  )
  // percentages are 0..1 → absolute scale (max 1)
  const compOption: EChartsOption = useMemo(() => horizontalBarOption(compBars, palette, 1), [compBars, palette])

  return (
    <section aria-label={t('dashboard:jobs.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:jobs.title')}
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard value={fmtPercent(jobs.successPct, locale)} label={t('dashboard:jobs.success')} tone="ok" />
        <KpiCard value={fmtInt(jobs.total, locale)} label={t('dashboard:jobs.total')} tone="muted" />
      </div>

      {jobBars.length > 0 && (
        <>
          <Chart
            option={jobOption}
            dark={dark}
            testId="jobs-bars"
            style={{ minHeight: jobBarHeight, width: '100%' }}
          />
          <Details summary={t('common:showDetails')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(jobs.counts).map(([status, count]) => (
                    <tr key={status} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">{status}</td>
                      <td className="py-1 text-right font-semibold text-gray-900 dark:text-gray-100">
                        {fmtInt(count, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Details>
        </>
      )}

      {jobs.capped && (
        <p className="mt-3 mb-4 text-xs text-amber-600 dark:text-amber-400">
          {t('common:capped', { n: fmtInt(jobs.windowSize, locale) })}
        </p>
      )}

      <h3 className="mb-3 mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:compliance.title')}
      </h3>
      <Chart
        option={compOption}
        dark={dark}
        testId="compliance-bars"
        style={{ minHeight: 150, width: '100%' }}
      />

      {compliance.capped && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          {t('common:capped', { n: fmtInt(compliance.windowSize, locale) })}
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Thread `dark` from Dashboard**

In `Dashboard.tsx`:
```tsx
      case 'jobs':
        return <JobsComplianceSection key={id} view={view} dark={dark} />
```

- [ ] **Step 5: Run tests + gates**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t JobsCompliance`
Expected: PASS.
Run: `npm run typecheck && ./node_modules/.bin/biome check src/components/dashboard/JobsComplianceSection.tsx src/components/dashboard/Dashboard.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/JobsComplianceSection.tsx src/components/dashboard/Dashboard.tsx src/components/dashboard/sections.test.tsx
git commit -m "feat(dashboard): jobs + compliance as bar charts with collapsible status table"
```

---

### Task 8: PoliciesSection → bars + collapsible tables

**Files:**
- Modify: `src/components/dashboard/PoliciesSection.tsx`, `src/components/dashboard/Dashboard.tsx` (one line)
- Test: `src/components/dashboard/sections.test.tsx` (PoliciesSection describe block)

**Interfaces:**
- Produces: `PoliciesSection({ view, dark }: { view: ReportView; dark: boolean })`.

- [ ] **Step 1: Update the PoliciesSection tests**

Replace the `PoliciesSection` describe block with:

```tsx
describe('PoliciesSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders total policy count "32 policies"', () => {
    render(<PoliciesSection view={policiesFixture} dark={false} />)
    expect(screen.getByText('32 policies')).toBeInTheDocument()
  })

  it('renders the by-purpose bar chart', () => {
    render(<PoliciesSection view={policiesFixture} dark={false} />)
    expect(screen.getByTestId('policies-bars')).toBeInTheDocument()
  })

  it('keeps the by-purpose and per-policy tables behind Show details', () => {
    render(<PoliciesSection view={policiesFixture} dark={false} />)
    expect(screen.getByText('Show details')).toBeInTheDocument()
    expect(screen.getAllByText('CENTRALIZED').length).toBeGreaterThan(0)
    expect(screen.getByText('SQL - Prod')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t Policies`
Expected: FAIL.

- [ ] **Step 3: Implement PoliciesSection**

Full file content for `src/components/dashboard/PoliciesSection.tsx`:

```tsx
import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, formatBytes, gbToBytes } from '../../utils/format'
import { Chart } from '../Chart'
import { Details } from '../Details'
import { type BarDatum, horizontalBarOption } from './barOption'

interface PoliciesSectionProps {
  view: ReportView
  dark: boolean
}

export function PoliciesSection({ view, dark }: PoliciesSectionProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT
  const { policies } = view

  const barData: BarDatum[] = useMemo(
    () =>
      Object.entries(policies.byPurpose).map(([purpose, n], i) => ({
        label: purpose,
        value: n,
        valueText: fmtInt(n, locale),
        color: i === 0 ? palette.accent : palette.muted,
      })),
    [policies.byPurpose, locale, palette],
  )
  const barOption: EChartsOption = useMemo(() => horizontalBarOption(barData, palette), [barData, palette])
  const barHeight = Math.max(110, barData.length * 30)

  return (
    <section aria-label={t('policies.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('policies.title')}
      </h2>

      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {t('policies.countLabel', { count: fmtInt(policies.count, locale) })}
      </p>

      {barData.length > 0 && (
        <>
          <Chart
            option={barOption}
            dark={dark}
            testId="policies-bars"
            style={{ minHeight: barHeight, width: '100%' }}
          />
          <Details summary={t('common:showDetails', { ns: 'common' })}>
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="pb-2 pr-4 font-medium">{t('policies.col.purpose')}</th>
                    <th className="pb-2 font-medium text-right">{t('policies.col.count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(policies.byPurpose).map(([purpose, count]) => (
                    <tr
                      key={purpose}
                      className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                    >
                      <td className="py-1.5 pr-4">{purpose}</td>
                      <td className="py-1.5 text-right font-semibold">{fmtInt(count, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {policies.perPolicy.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                      <th className="pb-2 pr-4 font-medium">{t('policies.col.policy')}</th>
                      <th className="pb-2 pr-4 font-medium">{t('policies.col.purpose')}</th>
                      <th className="pb-2 pr-4 font-medium text-right">{t('policies.col.assets')}</th>
                      <th className="pb-2 font-medium text-right">{t('policies.col.capacity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.perPolicy.map((row) => (
                      <tr
                        key={row.name}
                        className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                      >
                        <td className="py-1.5 pr-4 font-medium">{row.name}</td>
                        <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{row.purpose}</td>
                        <td className="py-1.5 pr-4 text-right">{fmtInt(row.assetCount, locale)}</td>
                        <td className="py-1.5 text-right">
                          {formatBytes(gbToBytes(row.protectionCapacityGb), locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Details>
        </>
      )}
    </section>
  )
}
```

(Note: this component's default namespace is `dashboard`, so `common:showDetails` is resolved with the explicit `{ ns: 'common' }` option.)

- [ ] **Step 4: Thread `dark` from Dashboard**

In `Dashboard.tsx`:
```tsx
      case 'policies':
        return <PoliciesSection key={id} view={view} dark={dark} />
```

- [ ] **Step 5: Run tests + gates**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t Policies`
Expected: PASS.
Run: `npm run typecheck && ./node_modules/.bin/biome check src/components/dashboard/PoliciesSection.tsx src/components/dashboard/Dashboard.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/PoliciesSection.tsx src/components/dashboard/Dashboard.tsx src/components/dashboard/sections.test.tsx
git commit -m "feat(dashboard): policies section as bar chart + collapsible tables"
```

---

### Task 9: IdleAgentsSection → tile grid

**Files:**
- Modify: `src/components/dashboard/IdleAgentsSection.tsx`
- Test: `src/components/dashboard/sections.test.tsx` (IdleAgentsSection describe block)

**Interfaces:**
- Produces: `IdleAgentsSection({ view }: { view: ReportView })` — signature unchanged (no chart, no `dark`; Tailwind `dark:` classes).

- [ ] **Step 1: Update the IdleAgentsSection tests**

Replace the `IdleAgentsSection` describe block with:

```tsx
describe('IdleAgentsSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders all idle agents as tiles', () => {
    const view: ReportView = { ...fixture, idleAgents: ['Oracle Databases', 'SAP HANA Databases'] }
    render(<IdleAgentsSection view={view} />)
    expect(screen.getByText('Oracle Databases')).toBeInTheDocument()
    expect(screen.getByText('SAP HANA Databases')).toBeInTheDocument()
  })

  it('renders nothing when idleAgents is empty', () => {
    const view: ReportView = { ...fixture, idleAgents: [] }
    const { container } = render(<IdleAgentsSection view={view} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run to verify it still passes (names present today)**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t IdleAgents`
Expected: PASS (names render in the current list; Step 3 keeps them present).

- [ ] **Step 3: Implement the tile grid**

Full file content for `src/components/dashboard/IdleAgentsSection.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

interface IdleAgentsSectionProps {
  view: ReportView
}

export function IdleAgentsSection({ view }: IdleAgentsSectionProps) {
  const { t, i18n } = useTranslation('dashboard')

  if (view.idleAgents.length === 0) return null

  return (
    <section aria-label={t('idle.title')}>
      <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('idle.title')}
      </h2>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        {fmtInt(view.idleAgents.length, i18n.language)} · {t('idle.subtitle')}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {view.idleAgents.map((name) => (
          <div
            key={name}
            className="rounded-lg border border-l-4 border-slate-200 border-l-blue-500 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:border-l-blue-400 dark:bg-slate-900 dark:text-slate-200"
          >
            {name}
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run tests + gates**

Run: `npm run test:run -- src/components/dashboard/sections.test.tsx -t IdleAgents`
Expected: PASS.
Run: `npm run typecheck && ./node_modules/.bin/biome check src/components/dashboard/IdleAgentsSection.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/IdleAgentsSection.tsx src/components/dashboard/sections.test.tsx
git commit -m "feat(dashboard): idle agents as a tile grid"
```

---

### Task 10: Full verification + visual review

**Files:** none (fix-only if a defect is found).

- [ ] **Step 1: Full gates**

Run: `npm run typecheck && npm run lint && npm run test:run && npm run build`
Expected: all PASS. (`Dashboard.test.tsx` renders the whole dashboard; if it asserted now-collapsed table content with `getByText` and that content is duplicated by a chart label, switch those to `getAllByText`.)

- [ ] **Step 2: Visual review**

Run `npm run dev`, open the app, drop a sample workbook (`ref/PPDM.xlsx`), and confirm: every section shows a chart (gaps/jobs/compliance/capacity/policies bars, idle tiles), each chart matches the deck look, "Show details" expands the original table, and light/dark both render. Adjust bar heights / `axisLabel.width` in the sections or `barOption.ts` if labels clip or bars overlap; re-commit any tweak.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/graphical-dashboard
gh pr create --title "Graphical dashboard — chart-led sections" --body "Brings the on-screen dashboard up to the exports' chart grammar (gaps/jobs/compliance/capacity/policies → ECharts bars, idle → tile grid), with detail tables behind a collapsible disclosure. Charts are decorative (data lives in KPIs + accessible tables). Dashboard-only; exports unchanged. Spec: docs/superpowers/specs/2026-06-18-graphical-dashboard-design.md"
```

---

## Self-Review

**Spec coverage:**
- Reuse `<Chart>` + Coverage pattern → Tasks 5–8 use `<Chart>` with `horizontalBarOption`. ✓
- Chart + collapsible `<details>` → `Details` (Task 2) used in Tasks 5–8. ✓
- Decorative charts (a11y) + `testId` for tests → Task 4 (Chart change + Coverage harmonized); all charts use `testId`, no `aria-label`. ✓
- Per-section mapping (gaps/jobs/compliance/capacity/policies/idle; coverage only harmonized) → Tasks 4–9. ✓
- `<Details>` only when a table exists → compliance & idle have no `Details` (Tasks 7, 9). ✓
- Capacity warn colour via existing `flagged` → Task 6. ✓
- New i18n key in 4 locales → Task 1. ✓
- No new dependency / `BarChart` already registered → Global Constraints; no `package.json` change. ✓
- Both themes via `dark` thread → each chart section adds `dark`, Dashboard updated per task; idle uses Tailwind. ✓
- Empty-data guards → every chart guarded by `…length > 0`. ✓
- Tests assert chart presence (`getByTestId`), `Show details`, dup-safe content → Tasks 4–9 use `getByTestId`/`getAllByText`. ✓

**Placeholder scan:** No TBD/TODO; every step carries real code/commands. ✓

**Type consistency:** `BarDatum { label, value, valueText, color }` and `horizontalBarOption(data, palette, max?)` defined in Task 3, consumed identically in Tasks 5–8. `Details({ summary, children })` defined in Task 2, used in Tasks 5–8. `<Chart option dark style? ariaLabel? testId? />` extended in Task 4 and used with `testId` in Tasks 4–8. Section props gain `dark: boolean`; Dashboard passes `dark={dark}` to gaps/jobs/capacity/policies (Tasks 5–8), idle unchanged (Task 9). ✓

**Deviations from spec (noted):** capacity bars use absolute scale (`max: 100`, Task 6) and compliance uses `max: 1` (Task 7), matching the deck's absolute-percent fix. Gaps bars cap at top-10 for readability (Task 5); the full list stays in `Details`.
