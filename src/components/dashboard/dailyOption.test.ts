// src/components/dashboard/dailyOption.test.ts
import { describe, expect, it } from 'vitest'
import type { DailyPoint } from '../../engines/aggregation/activity'
import { LIGHT } from '../../theme/palette'
import { dailyOption } from './dailyOption'

const daily: DailyPoint[] = [
  { day: '2026-06-15', gb: 10, jobs: 2 },
  { day: '2026-06-16', gb: 5, jobs: 1 },
  { day: '2026-06-17', gb: 8, jobs: 3 },
]

describe('dailyOption', () => {
  it('emits exactly one series', () => {
    const opt = dailyOption(daily, LIGHT, 'Transferred')
    expect((opt.series as unknown[]).length).toBe(1)
  })

  it('carries one [day, gb] pair per daily point, in order', () => {
    const opt = dailyOption(daily, LIGHT, 'Transferred')
    // biome-ignore lint/suspicious/noExplicitAny: ECharts series shape is loosely typed
    const series = opt.series as any[]
    expect(series[0].data).toEqual([
      ['2026-06-15', 10],
      ['2026-06-16', 5],
      ['2026-06-17', 8],
    ])
    expect(series[0].showSymbol).toBe(false)
    expect(series[0].name).toBe('Transferred')
  })

  it('uses a time x-axis', () => {
    const opt = dailyOption(daily, LIGHT, 'Transferred')
    expect((opt.xAxis as { type: string }).type).toBe('time')
  })

  it('handles an empty daily series', () => {
    const opt = dailyOption([], LIGHT, 'Transferred')
    // biome-ignore lint/suspicious/noExplicitAny: ECharts series shape is loosely typed
    const series = opt.series as any[]
    expect(series[0].data).toEqual([])
  })
})
