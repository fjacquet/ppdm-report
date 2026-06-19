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
    const formatter = (opt.series as any[])[0].label.formatter as (p: {
      dataIndex: number
    }) => string
    expect(formatter({ dataIndex: 0 })).toBe('90 %')
    expect(formatter({ dataIndex: 1 })).toBe('40 %')
  })

  it('honors an absolute max for ratio/percent bars', () => {
    const opt = horizontalBarOption(data, LIGHT, 100)
    // biome-ignore lint/suspicious/noExplicitAny: ECharts axis shape is loosely typed
    expect((opt.xAxis as any).max).toBe(100)
  })
})
