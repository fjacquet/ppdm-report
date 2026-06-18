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
