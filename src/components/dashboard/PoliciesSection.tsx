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
  const barOption: EChartsOption = useMemo(
    () => horizontalBarOption(barData, palette),
    [barData, palette],
  )
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
                      <th className="pb-2 pr-4 font-medium text-right">
                        {t('policies.col.assets')}
                      </th>
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
                        <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                          {row.purpose}
                        </td>
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
