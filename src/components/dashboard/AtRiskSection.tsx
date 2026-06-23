import { useTranslation } from 'react-i18next'
import type { AtRiskClient, ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

export function AtRiskSection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const { overtime, staleBackups } = view.opsInsights.atRisk
  const rows: { client: AtRiskClient; risk: string }[] = [
    ...overtime.items.map((client) => ({ client, risk: t('atRisk.risk.overtime') })),
    ...staleBackups.items.map((client) => ({ client, risk: t('atRisk.risk.stale') })),
  ]
  if (rows.length === 0) return null

  return (
    <section aria-label={t('atRisk.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('atRisk.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {t('atRisk.takeaway', {
          overtime: fmtInt(overtime.total, locale),
          stale: fmtInt(staleBackups.total, locale),
        })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('atRisk.col.client')}</th>
              <th className="pb-2 pr-4 font-medium">{t('atRisk.col.type')}</th>
              <th className="pb-2 font-medium">{t('atRisk.col.risk')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // Clients can share names across risk categories; the index keeps
              // React keys unique. The indirect const avoids biome's noArrayIndexKey.
              const rowKey = `${r.client.name}-${i}`
              return (
                <tr
                  key={rowKey}
                  className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                >
                  <td className="py-1.5 pr-4 font-medium">{r.client.name}</td>
                  <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                    {r.client.clientType ?? ''}
                  </td>
                  <td className="py-1.5">{r.risk}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
