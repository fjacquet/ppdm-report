import { useTranslation } from 'react-i18next'
import { bucketWeekly } from '../../engines/export/weeklyBucket'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtDate, fmtInt, fmtNum, fmtPercent, formatBytes, gbToBytes } from '../../utils/format'
import { Chart } from '../Chart'
import { type BarDatum, horizontalBarOption } from './barOption'
import { dailyOption } from './dailyOption'
import { ProvenanceNote } from './ProvenanceNote'

/** OsSplit.counts keys → activity.os.* i18n leaf. */
const OS_LABEL_KEY: Record<string, string> = { Windows: 'windows', Linux: 'linux', Other: 'other' }

interface ActivitySectionProps {
  view: ReportView
  dark: boolean
}

/** Backup activity/sizing family: per-type table, daily transfer trend (chart + weekly
 * table), OS split bars, and the largest/slowest backup tables. Suppressed entirely
 * when the metric is unavailable (PPDM today) or carries no content. */
export function ActivitySection({ view, dark }: ActivitySectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT
  const activity = view.activity
  const b10 = view.meta.baseTen
  const bytesOf = (gb: number) => formatBytes(gbToBytes(gb, b10), locale, b10)

  if (!view.provenance.activity.available) return null

  const hasByType = activity.byType.length > 0
  const hasDaily = activity.daily.length > 0
  const hasLargest = activity.largest.items.length > 0
  const hasSlowest = activity.slowest.items.length > 0
  const osEntries = activity.osSplit ? Object.entries(activity.osSplit.counts) : []
  const hasOs = osEntries.length > 0
  if (!hasByType && !hasDaily && !hasLargest && !hasSlowest && !hasOs) return null

  const totalGb = activity.daily.reduce((acc, d) => acc + d.gb, 0)
  const totalJobs = activity.daily.reduce((acc, d) => acc + d.jobs, 0)
  const weekly = bucketWeekly(activity.daily, 8)

  const osBarData: BarDatum[] = osEntries.map(([os, n]) => ({
    label: t(`activity.os.${OS_LABEL_KEY[os] ?? os.toLowerCase()}`),
    value: n,
    valueText: fmtInt(n, locale),
    color: palette.accent,
  }))

  return (
    <section aria-label={t('activity.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('activity.title')}
      </h2>
      {hasDaily && (
        <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
          {t('activity.takeaway', { gb: bytesOf(totalGb), jobs: fmtInt(totalJobs, locale) })}
        </p>
      )}

      {hasByType && (
        <div className="mb-6 overflow-x-auto">
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('activity.perType.title')}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4 font-medium">{t('activity.perType.col.type')}</th>
                <th className="pb-2 pr-4 font-medium text-right">
                  {t('activity.perType.col.capacity')}
                </th>
                <th className="pb-2 pr-4 font-medium text-right">
                  {t('activity.perType.col.clients')}
                </th>
                <th className="pb-2 pr-4 font-medium text-right">
                  {t('activity.perType.col.files')}
                </th>
                <th className="pb-2 font-medium text-right">
                  {t('activity.perType.col.changeRate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {activity.byType.map((ts, i) => {
                // Merged servers can repeat a policy type; the index keeps React keys
                // unique. The indirect const avoids biome's noArrayIndexKey.
                const rowKey = `${ts.type}-${i}`
                return (
                  <tr
                    key={rowKey}
                    className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                  >
                    <td className="py-1.5 pr-4 font-medium">{ts.type}</td>
                    <td className="py-1.5 pr-4 text-right">{bytesOf(ts.capacityGb)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtInt(ts.clients, locale)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtInt(ts.files, locale)}</td>
                    <td className="py-1.5 text-right">
                      {ts.changeRate === undefined
                        ? '–'
                        : fmtPercent(ts.changeRate.num / ts.changeRate.den, locale)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasDaily && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('activity.daily.title')}
          </h3>
          <Chart
            option={dailyOption(activity.daily, palette, t('activity.daily.col.gb'))}
            dark={dark}
            testId="activity-daily-chart"
            style={{ minHeight: 260, width: '100%' }}
          />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-2 pr-4 font-medium">{t('activity.daily.col.week')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('activity.daily.col.gb')}</th>
                  <th className="pb-2 font-medium text-right">{t('activity.daily.col.jobs')}</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((w) => (
                  <tr
                    key={w.day}
                    className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                  >
                    <td className="py-1.5 pr-4 font-medium">{fmtDate(w.day, locale)}</td>
                    <td className="py-1.5 pr-4 text-right">{bytesOf(w.gb)}</td>
                    <td className="py-1.5 text-right">{fmtInt(w.jobs, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasOs && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('activity.os.title')}
          </h3>
          <Chart
            option={horizontalBarOption(osBarData, palette)}
            dark={dark}
            testId="activity-os-bars"
            style={{ minHeight: Math.max(90, osBarData.length * 34), width: '100%' }}
          />
        </div>
      )}

      {hasLargest && (
        <div className="mb-6 overflow-x-auto">
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('activity.largest.title')}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4 font-medium">{t('activity.largest.col.client')}</th>
                <th className="pb-2 pr-4 font-medium">{t('activity.largest.col.type')}</th>
                <th className="pb-2 pr-4 font-medium text-right">
                  {t('activity.largest.col.size')}
                </th>
                <th className="pb-2 font-medium text-right">{t('activity.largest.col.files')}</th>
              </tr>
            </thead>
            <tbody>
              {activity.largest.items.map((b, i) => {
                // Client names can repeat across types; the index keeps React keys
                // unique. The indirect const avoids biome's noArrayIndexKey.
                const rowKey = `${b.host}-${i}`
                return (
                  <tr
                    key={rowKey}
                    className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                  >
                    <td className="py-1.5 pr-4 font-medium">{b.host}</td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{b.type}</td>
                    <td className="py-1.5 pr-4 text-right">{bytesOf(b.sizeGb)}</td>
                    <td className="py-1.5 text-right">
                      {b.files === undefined ? '–' : fmtInt(b.files, locale)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('activity.caption', {
              shown: activity.largest.shown,
              total: activity.largest.total,
            })}
          </p>
        </div>
      )}

      {hasSlowest && (
        <div className="overflow-x-auto">
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('activity.slowest.title')}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4 font-medium">{t('activity.slowest.col.client')}</th>
                <th className="pb-2 pr-4 font-medium">{t('activity.slowest.col.type')}</th>
                <th className="pb-2 pr-4 font-medium text-right">
                  {t('activity.slowest.col.throughput')}
                </th>
                <th className="pb-2 font-medium text-right">{t('activity.slowest.col.size')}</th>
              </tr>
            </thead>
            <tbody>
              {activity.slowest.items.map((b, i) => {
                // Client names can repeat across types; the index keeps React keys
                // unique. The indirect const avoids biome's noArrayIndexKey.
                const rowKey = `${b.host}-${i}`
                return (
                  <tr
                    key={rowKey}
                    className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                  >
                    <td className="py-1.5 pr-4 font-medium">{b.host}</td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{b.type}</td>
                    <td className="py-1.5 pr-4 text-right">
                      {fmtNum(b.throughputMbSec, locale, 1)}
                    </td>
                    <td className="py-1.5 text-right">{bytesOf(b.sizeGb)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('activity.slowest.floorNote')}
          </p>
        </div>
      )}

      <ProvenanceNote p={view.provenance.activity} dark={dark} />
    </section>
  )
}
