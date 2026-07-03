import { useTranslation } from 'react-i18next'
import { RETENTION_BUCKET_IDS } from '../../engines/aggregation/efficiency'
import type { ReportView } from '../../types/reportView'
import { fmtPercent, formatBytes, gbToBytes } from '../../utils/format'

export function EfficiencySection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const eff = view.efficiency
  const baseTen = view.meta.baseTen
  const bytesOf = (gb: number) => formatBytes(gbToBytes(gb, baseTen), locale, baseTen)

  if (Object.values(eff).every((v) => v === undefined)) return null

  const retention = eff.retention
  const lowDedupe = eff.dedupe?.lowDedupe
  const common = eff.dedupe?.common

  return (
    <section aria-label={t('efficiency.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('efficiency.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {common
          ? t('efficiency.takeaway', {
              dedupe: fmtPercent(common.num / common.den / 100, locale),
            })
          : t('efficiency.takeawayNoDedupe')}
      </p>

      {retention && (
        <div className="mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4 font-medium">{t('efficiency.retention.col.type')}</th>
                {RETENTION_BUCKET_IDS.map((id) => (
                  <th key={id} className="pb-2 pr-4 font-medium">
                    {t(`efficiency.retention.bucket.${id}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retention.perPolicyType.map((row, i) => {
                // Merged Avamar grids can each carry a row for the same policy
                // type; the index keeps React keys unique. The indirect const
                // avoids biome's noArrayIndexKey.
                const rowKey = `${row.type}-${i}`
                return (
                  <tr
                    key={rowKey}
                    className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                  >
                    <td className="py-1.5 pr-4 font-medium">{row.type}</td>
                    {RETENTION_BUCKET_IDS.map((id) => (
                      <td key={id} className="py-1.5 pr-4">
                        {bytesOf(row.gbByBucket[id])}
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr className="text-gray-900 dark:text-gray-100 font-semibold">
                <td className="py-1.5 pr-4">{t('efficiency.retention.col.total')}</td>
                {RETENTION_BUCKET_IDS.map((id) => (
                  <td key={id} className="py-1.5 pr-4">
                    {bytesOf(retention.totalGbByBucket[id])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {lowDedupe && lowDedupe.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4 font-medium">{t('efficiency.lowDedupe.col.client')}</th>
                <th className="pb-2 pr-4 font-medium">{t('efficiency.lowDedupe.col.common')}</th>
                <th className="pb-2 font-medium">{t('efficiency.lowDedupe.col.processed')}</th>
              </tr>
            </thead>
            <tbody>
              {lowDedupe.items.map((c, i) => {
                // Clients can share names across merged servers; the index keeps
                // React keys unique. The indirect const avoids biome's noArrayIndexKey.
                const rowKey = `${c.host}-${i}`
                return (
                  <tr
                    key={rowKey}
                    className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                  >
                    <td className="py-1.5 pr-4 font-medium">{c.host}</td>
                    <td className="py-1.5 pr-4">{fmtPercent(c.commonPct / 100, locale)}</td>
                    <td className="py-1.5">{bytesOf(c.processedGb)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('efficiency.lowDedupe.caption', {
              shown: lowDedupe.shown,
              total: lowDedupe.total,
            })}
          </p>
        </div>
      )}
    </section>
  )
}
