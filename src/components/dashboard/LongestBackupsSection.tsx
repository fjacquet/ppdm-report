import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtNum, formatBytes, gbToBytes } from '../../utils/format'

export function LongestBackupsSection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const b10 = view.meta.baseTen
  const { longestBackups } = view.opsInsights
  if (longestBackups.items.length === 0) return null

  return (
    <section aria-label={t('longestBackups.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('longestBackups.title')}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('longestBackups.col.server')}</th>
              <th className="pb-2 pr-4 font-medium">{t('longestBackups.col.type')}</th>
              <th className="pb-2 pr-4 font-medium text-right">
                {t('longestBackups.col.duration')}
              </th>
              <th className="pb-2 pr-4 font-medium text-right">
                {t('longestBackups.col.capacity')}
              </th>
              <th className="pb-2 font-medium text-right">{t('longestBackups.col.throughput')}</th>
            </tr>
          </thead>
          <tbody>
            {longestBackups.items.map((r, i) => {
              // Server names can repeat across policy types; the index keeps keys
              // unique. The indirect const avoids biome's noArrayIndexKey.
              const rowKey = `${r.server}-${i}`
              return (
                <tr
                  key={rowKey}
                  className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                >
                  <td className="py-1.5 pr-4 font-medium">{r.server}</td>
                  <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{r.policyType}</td>
                  <td className="py-1.5 pr-4 text-right">{fmtNum(r.durationHr, locale, 1)}</td>
                  <td className="py-1.5 pr-4 text-right">
                    {r.capacityGb === undefined
                      ? '–'
                      : formatBytes(gbToBytes(r.capacityGb, b10), locale, b10)}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.throughputMbSec === undefined ? '–' : fmtNum(r.throughputMbSec, locale, 1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
