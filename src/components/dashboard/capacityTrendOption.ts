// src/components/dashboard/capacityTrendOption.ts
import type { EChartsOption } from 'echarts/types/dist/shared'
import type { TrendTarget } from '../../engines/aggregation/capacityTrend'

/**
 * Multi-series utilization-over-time line chart: one `line` series per target,
 * fed the [day, pct] pairs already computed by `computeCapacityTrend`. A time
 * x-axis consumes those pairs directly (no day-string bucketing needed). The
 * 80%-utilization reference is drawn as a silent `markLine` on the first
 * series so it renders once regardless of target count.
 */
export function capacityTrendOption(targets: TrendTarget[]): EChartsOption {
  return {
    legend: { show: true },
    tooltip: { show: true, trigger: 'axis' },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', max: 100 },
    series: targets.map((t, i) => ({
      type: 'line' as const,
      name: t.target,
      showSymbol: false,
      data: t.series,
      ...(i === 0
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              data: [{ yAxis: 80, label: { formatter: '80%' } }],
            },
          }
        : {}),
    })),
  }
}
