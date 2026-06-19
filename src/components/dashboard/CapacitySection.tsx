import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercentValue } from '../../utils/format'
import { Chart } from '../Chart'
import { Details } from '../Details'
import { type BarDatum, horizontalBarOption } from './barOption'
import { ProvenanceNote } from './ProvenanceNote'

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
  const barOption: EChartsOption = useMemo(
    () => horizontalBarOption(barData, palette, 100),
    [barData, palette],
  )
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
                      <tr
                        key={target.name}
                        className={rowClass}
                        data-flagged={target.flagged || undefined}
                      >
                        <td className="py-1.5 pr-4 font-medium">{target.name}</td>
                        <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                          {target.type}
                        </td>
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
      <ProvenanceNote p={view.provenance.storageTargets} dark={dark} />
    </section>
  )
}
