import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, formatBytes, formatGbOrUnknown, gbToBytes } from '../../utils/format'
import { Chart } from '../Chart'
import { Details } from '../Details'
import { type BarDatum, horizontalBarOption } from './barOption'
import { ProvenanceNote } from './ProvenanceNote'

interface GapsSectionProps {
  view: ReportView
  dark: boolean
}

export function GapsSection({ view, dark }: GapsSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT

  const { top, count } = view.gaps

  const barData: BarDatum[] = useMemo(
    () =>
      top.items
        .filter((a) => a.sizeGb !== undefined)
        .slice(0, 10)
        .map((a) => ({
          label: a.name,
          value: a.sizeGb as number,
          valueText: formatBytes(gbToBytes(a.sizeGb as number), locale),
          color: palette.bad,
        })),
    [top.items, locale, palette],
  )
  const barOption: EChartsOption = useMemo(
    () => horizontalBarOption(barData, palette),
    [barData, palette],
  )
  const barHeight = Math.max(120, barData.length * 34)

  return (
    <section aria-label={t('dashboard:exposure.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:exposure.title')}
      </h2>

      {/* KPI row */}
      <div className="mb-4 flex gap-8">
        <div>
          <p className="text-3xl font-bold text-red-500">
            {formatGbOrUnknown(view.gaps.totalCapacityGb, locale, t('common:sizeUnknown'))}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('dashboard:exposure.unprotectedTb')}
          </p>
        </div>
        <div>
          <p className="text-3xl font-bold text-red-500">{fmtInt(count, locale)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard:exposure.assets')}</p>
        </div>
      </div>

      {barData.length > 0 && (
        <Chart
          option={barOption}
          dark={dark}
          testId="gaps-bars"
          style={{ minHeight: barHeight, width: '100%' }}
        />
      )}
      {top.items.length > 0 && (
        <Details summary={t('common:showDetails')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-2 pr-4 font-medium">{t('common:col.name')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('common:col.type')}</th>
                  <th className="pb-2 font-medium text-right">{t('common:col.size')}</th>
                </tr>
              </thead>
              <tbody>
                {top.items.map((item, index) => {
                  // Unprotected assets can share name+type+size (e.g. several
                  // "X:\\" at 11 TB), so the index keeps React keys unique; the
                  // list is static per render (remounts on upload). The indirect
                  // const avoids biome's noArrayIndexKey.
                  const rowKey = `${item?.name}-${index}`
                  return (
                    <tr
                      key={rowKey}
                      className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                    >
                      <td className="py-1.5 pr-4">{item?.name}</td>
                      <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{item?.type}</td>
                      <td className="py-1.5 text-right">
                        {formatGbOrUnknown(item?.sizeGb, locale, t('common:sizeUnknown'))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              {t('common:topOf', { shown: top.shown, total: top.total })}
            </p>
          </div>
        </Details>
      )}
      <ProvenanceNote p={view.provenance.gapsList} dark={dark} />
    </section>
  )
}
