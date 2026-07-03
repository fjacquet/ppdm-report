// src/components/dashboard/dailyOption.ts
import type { EChartsOption } from 'echarts/types/dist/shared'
import type { DailyPoint } from '../../engines/aggregation/activity'
import type { Palette } from '../../theme/palette'

/**
 * Single-series time-based line chart of daily transferred capacity, built as
 * data only (mirrors `capacityTrendOption`'s `[day, value]` time-axis pattern —
 * no ISO-week bucketing here; the full daily resolution is handed straight to
 * ECharts' time axis).
 */
export function dailyOption(
  daily: DailyPoint[],
  palette: Palette,
  seriesName: string,
): EChartsOption {
  return {
    tooltip: { show: true, trigger: 'axis' },
    xAxis: { type: 'time' },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line' as const,
        name: seriesName,
        showSymbol: false,
        lineStyle: { color: palette.accent },
        itemStyle: { color: palette.accent },
        data: daily.map((d) => [d.day, d.gb] as [string, number]),
      },
    ],
  }
}
