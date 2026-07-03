// src/components/dashboard/capacityTrendOption.test.ts
import { describe, expect, it } from 'vitest'
import type { TrendTarget } from '../../engines/aggregation/capacityTrend'
import { capacityTrendOption } from './capacityTrendOption'

const targets: TrendTarget[] = [
  {
    target: 'dd1',
    currentPct: 72,
    minPct: 60,
    maxPct: 72,
    windowStart: '2026-05-01',
    windowEnd: '2026-06-30',
    sampleCount: 3,
    slopePer30d: 4.2,
    series: [
      ['2026-05-01', 60],
      ['2026-06-01', 66],
      ['2026-06-30', 72],
    ],
  },
  {
    target: 'dd2',
    currentPct: 40,
    minPct: 38,
    maxPct: 41,
    windowStart: '2026-05-01',
    windowEnd: '2026-06-30',
    sampleCount: 2,
    series: [
      ['2026-05-01', 38],
      ['2026-06-30', 40],
    ],
  },
]

describe('capacityTrendOption', () => {
  it('emits one series per target', () => {
    const opt = capacityTrendOption(targets)
    expect((opt.series as unknown[]).length).toBe(targets.length)
  })

  it('each series carries its own target data (length + name)', () => {
    const opt = capacityTrendOption(targets)
    // biome-ignore lint/suspicious/noExplicitAny: ECharts series shape is loosely typed
    const series = opt.series as any[]
    targets.forEach((t, i) => {
      expect(series[i].name).toBe(t.target)
      expect(series[i].data.length).toBe(t.series.length)
      expect(series[i].showSymbol).toBe(false)
    })
  })

  it('caps the y-axis at 100', () => {
    const opt = capacityTrendOption(targets)
    // biome-ignore lint/suspicious/noExplicitAny: ECharts axis shape is loosely typed
    expect((opt.yAxis as any).max).toBe(100)
  })

  it('draws the 80% reference line on the first series only', () => {
    const opt = capacityTrendOption(targets)
    // biome-ignore lint/suspicious/noExplicitAny: ECharts series shape is loosely typed
    const series = opt.series as any[]
    expect(series[0].markLine.data[0].yAxis).toBe(80)
    expect(series[1].markLine).toBeUndefined()
  })
})
