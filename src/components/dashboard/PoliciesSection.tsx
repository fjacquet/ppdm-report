import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt, formatBytes, gbToBytes } from '../../utils/format'

interface PoliciesSectionProps {
  view: ReportView
}

export function PoliciesSection({ view }: PoliciesSectionProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language

  const { policies } = view

  return (
    <section aria-label={t('policies.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('policies.title')}
      </h2>

      {/* Total policy count */}
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {t('policies.countLabel', { count: fmtInt(policies.count, locale) })}
      </p>

      {/* By purpose tally */}
      {Object.keys(policies.byPurpose).length > 0 && (
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
      )}

      {/* Per-policy rows */}
      {policies.perPolicy.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4 font-medium">{t('policies.col.policy')}</th>
                <th className="pb-2 pr-4 font-medium">{t('policies.col.purpose')}</th>
                <th className="pb-2 pr-4 font-medium text-right">{t('policies.col.assets')}</th>
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
                  <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{row.purpose}</td>
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
    </section>
  )
}
