import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

export function AgentVersionsSection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const { agentVersions } = view.opsInsights
  if (agentVersions.length === 0) return null

  return (
    <section aria-label={t('agentVersions.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('agentVersions.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {t('agentVersions.takeaway', { count: fmtInt(agentVersions.length, locale) })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('agentVersions.col.version')}</th>
              <th className="pb-2 font-medium text-right">{t('agentVersions.col.count')}</th>
            </tr>
          </thead>
          <tbody>
            {agentVersions.map((r) => (
              <tr
                key={r.version}
                className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{r.version}</td>
                <td className="py-1.5 text-right">{fmtInt(r.count, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
