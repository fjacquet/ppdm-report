import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

export function ReliabilitySection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const rel = view.reliability
  if (rel.repeatFailures.total === 0) return null

  return (
    <section aria-label={t('reliability.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('reliability.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {t('reliability.takeaway', { count: fmtInt(rel.repeatFailures.total, locale) })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('reliability.col.client')}</th>
              <th className="pb-2 pr-4 font-medium">{t('reliability.col.failureDays')}</th>
              <th className="pb-2 pr-4 font-medium">{t('reliability.col.failedJobs')}</th>
              <th className="pb-2 pr-4 font-medium">{t('reliability.col.lastSuccess')}</th>
              <th className="pb-2 font-medium">{t('reliability.col.successRate')}</th>
            </tr>
          </thead>
          <tbody>
            {rel.repeatFailures.items.map((c, i) => {
              // Clients can share names across merged servers; the index keeps
              // React keys unique. The indirect const avoids biome's noArrayIndexKey.
              const rowKey = `${c.host}-${i}`
              return (
                <tr
                  key={rowKey}
                  className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                >
                  <td className="py-1.5 pr-4 font-medium">{c.host}</td>
                  <td className="py-1.5 pr-4">{fmtInt(c.failureDays, locale)}</td>
                  <td className="py-1.5 pr-4">{fmtInt(c.failedJobs, locale)}</td>
                  <td className="py-1.5 pr-4">
                    {c.daysSinceSuccess === undefined
                      ? t('reliability.noSuccess')
                      : fmtInt(c.daysSinceSuccess, locale)}
                  </td>
                  <td className="py-1.5">
                    {c.successRatePct === undefined ? '–' : `${fmtInt(c.successRatePct, locale)} %`}
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
