import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtNum, fmtPercentValue } from '../../utils/format'
import { Chart } from '../Chart'
import { capacityTrendOption } from './capacityTrendOption'

export function CapacityTrendSection({ view, dark }: { view: ReportView; dark: boolean }) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language
  const { targets } = view.capacityTrend
  if (targets.length === 0) return null

  // Fastest-growing target: highest defined slopePer30d wins the takeaway.
  const fastest = targets.reduce<(typeof targets)[number] | undefined>((best, t) => {
    if (t.slopePer30d === undefined) return best
    if (best === undefined || best.slopePer30d === undefined) return t
    return t.slopePer30d > best.slopePer30d ? t : best
  }, undefined)

  const takeaway =
    fastest?.slopePer30d !== undefined && fastest.slopePer30d >= 1
      ? t('capacityTrend.takeaway', {
          target: fastest.target,
          slope: fmtNum(fastest.slopePer30d, locale, 1),
        })
      : t('capacityTrend.takeawayFlat')

  return (
    <section aria-label={t('capacityTrend.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('capacityTrend.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">{takeaway}</p>

      <Chart
        option={capacityTrendOption(targets)}
        dark={dark}
        testId="capacity-trend-chart"
        style={{ minHeight: 320, width: '100%' }}
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('capacityTrend.col.target')}</th>
              <th className="pb-2 pr-4 font-medium">{t('capacityTrend.col.current')}</th>
              <th className="pb-2 pr-4 font-medium">{t('capacityTrend.col.min')}</th>
              <th className="pb-2 pr-4 font-medium">{t('capacityTrend.col.max')}</th>
              <th className="pb-2 pr-4 font-medium">{t('capacityTrend.col.slope')}</th>
              <th className="pb-2 font-medium">{t('capacityTrend.col.window')}</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((tg) => (
              <tr
                key={tg.target}
                className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{tg.target}</td>
                <td className="py-1.5 pr-4">{fmtPercentValue(tg.currentPct, locale)}</td>
                <td className="py-1.5 pr-4">{fmtPercentValue(tg.minPct, locale)}</td>
                <td className="py-1.5 pr-4">{fmtPercentValue(tg.maxPct, locale)}</td>
                <td className="py-1.5 pr-4">
                  {tg.slopePer30d === undefined
                    ? t('capacityTrend.noSlope')
                    : fmtNum(tg.slopePer30d, locale, 1)}
                </td>
                <td className="py-1.5">
                  {tg.windowStart} – {tg.windowEnd}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {t('capacityTrend.observedNote')}
      </p>
    </section>
  )
}
