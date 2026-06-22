import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DARK, LIGHT } from '../../theme/palette'
import type { ServerView } from '../../types/reportView'
import { fmtDate, fmtInt, fmtPercent, formatGbOrUnknown } from '../../utils/format'
import { Chart } from '../Chart'
import { type BarDatum, horizontalBarOption } from './barOption'

interface PerServerSectionProps {
  servers: ServerView[]
  dark: boolean
}

/** Per-server comparison: coverage-% bar chart + a KPI table across servers. */
export function PerServerSection({ servers, dark }: PerServerSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT

  const barData: BarDatum[] = useMemo(
    () =>
      servers.map((s) => ({
        label: s.label,
        value: s.view.coverage.overall.pct,
        valueText: fmtPercent(s.view.coverage.overall.pct, locale),
        color: s.view.coverage.overall.pct < 0.5 ? palette.bad : palette.ok,
      })),
    [servers, locale, palette],
  )
  const barOption: EChartsOption = useMemo(
    () => horizontalBarOption(barData, palette, 1),
    [barData, palette],
  )

  if (servers.length < 2) return null

  return (
    <section aria-label={t('dashboard:perServer.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:perServer.title')}
      </h2>
      <Chart
        option={barOption}
        dark={dark}
        testId="per-server-bars"
        style={{ minHeight: Math.max(120, servers.length * 34), width: '100%' }}
      />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('dashboard:perServer.col.server')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:kpi.coverage')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:exposure.assets')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:exposure.unprotectedTb')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:jobs.success')}</th>
              <th className="pb-2 pr-4 font-medium">{t('dashboard:perServer.col.captured')}</th>
              <th className="pb-2 font-medium">{t('dashboard:perServer.col.version')}</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr
                key={s.label}
                className="border-b border-gray-100 text-gray-800 dark:border-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{s.label}</td>
                <td className="py-1.5 pr-4">{fmtPercent(s.view.coverage.overall.pct, locale)}</td>
                <td className="py-1.5 pr-4">{fmtInt(s.view.gaps.count, locale)}</td>
                <td className="py-1.5 pr-4">
                  {formatGbOrUnknown(s.view.gaps.totalCapacityGb, locale, t('common:sizeUnknown'))}
                </td>
                <td className="py-1.5 pr-4">{fmtPercent(s.view.jobs.successPct, locale)}</td>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                  {fmtDate(s.view.meta.capturedAt.slice(0, 10), locale)}
                </td>
                <td className="py-1.5 text-gray-500 dark:text-gray-400">{s.version || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
