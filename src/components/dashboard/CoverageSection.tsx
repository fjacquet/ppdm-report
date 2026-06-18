import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercent } from '../../utils/format'
import { Chart } from '../Chart'

interface CoverageSectionProps {
  view: ReportView
  dark: boolean
}

export function CoverageSection({ view, dark }: CoverageSectionProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT
  const { overall, byType } = view.coverage

  // Overall donut (pie) option
  const donutOption: EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          data: [
            {
              value: overall.protected,
              name: t('coverage.protected'),
              itemStyle: { color: palette.ok },
            },
            {
              value: overall.unprotected,
              name: t('coverage.unprotected'),
              itemStyle: { color: palette.bad },
            },
            {
              value: overall.excluded,
              name: t('coverage.excluded'),
              itemStyle: { color: palette.excluded },
            },
          ],
          label: { show: false },
        },
      ],
    }),
    [overall.protected, overall.unprotected, overall.excluded, palette, t],
  )

  // Per-type horizontal bar option
  const typeNames = useMemo(() => Object.keys(byType), [byType])
  const barOption: EChartsOption = useMemo(
    () => ({
      grid: { containLabel: true, left: 8, right: 16, top: 8, bottom: 8 },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category',
        data: typeNames,
        axisLabel: { color: palette.ink },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          name: t('coverage.protected'),
          stack: 'total',
          data: typeNames.map((k) => byType[k]?.protected ?? 0),
          itemStyle: { color: palette.ok },
        },
        {
          type: 'bar',
          name: t('coverage.unprotected'),
          stack: 'total',
          data: typeNames.map((k) => byType[k]?.unprotected ?? 0),
          itemStyle: { color: palette.bad },
        },
        {
          type: 'bar',
          name: t('coverage.excluded'),
          stack: 'total',
          data: typeNames.map((k) => byType[k]?.excluded ?? 0),
          itemStyle: { color: palette.excluded },
        },
      ],
    }),
    [byType, typeNames, palette, t],
  )

  const barHeight = Math.max(120, typeNames.length * 36)

  return (
    <section aria-label={t('coverage.title')}>
      <h2 className="mb-4 text-lg font-semibold" style={{ color: palette.ink }}>
        {t('coverage.title')}
      </h2>

      {/* Headline percentages */}
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-3xl font-bold" style={{ color: palette.ok }}>
          {fmtPercent(overall.pct, locale)}
        </span>
        <span className="text-sm" style={{ color: palette.muted }}>
          <span>{fmtPercent(overall.pctInclExcluded, locale)}</span> {t('coverage.inclExcluded')}
        </span>
      </div>

      {/* Legend counts */}
      <div className="mb-4 flex gap-6 text-sm">
        <span>
          <span className="font-semibold" style={{ color: palette.ok }}>
            {fmtInt(overall.protected, locale)}
          </span>{' '}
          {t('coverage.protected')}
        </span>
        <span>
          <span className="font-semibold" style={{ color: palette.bad }}>
            {fmtInt(overall.unprotected, locale)}
          </span>{' '}
          {t('coverage.unprotected')}
        </span>
        <span>
          <span className="font-semibold" style={{ color: palette.muted }}>
            {fmtInt(overall.excluded, locale)}
          </span>{' '}
          {t('coverage.excluded')}
        </span>
      </div>

      {/* Charts */}
      <div className="flex flex-col gap-4 md:flex-row">
        <Chart
          option={donutOption}
          dark={dark}
          ariaLabel="coverage donut"
          style={{ minHeight: 240, width: '100%', flex: '0 0 240px' }}
        />
        {typeNames.length > 0 && (
          <Chart
            option={barOption}
            dark={dark}
            ariaLabel="coverage per type bars"
            style={{ minHeight: barHeight, width: '100%' }}
          />
        )}
      </div>
    </section>
  )
}
