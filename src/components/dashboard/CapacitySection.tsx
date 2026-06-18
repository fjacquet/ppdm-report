import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercentValue } from '../../utils/format'

interface CapacitySectionProps {
  view: ReportView
}

export function CapacitySection({ view }: CapacitySectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language

  const { capacity } = view

  return (
    <section aria-label={t('capacity.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('capacity.title')}
      </h2>

      {/* mtreeCount summary */}
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {fmtInt(capacity.mtreeCount, locale)} mtrees
      </p>

      {/* Storage targets table */}
      {capacity.targets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4 font-medium">{t('common:col.name')}</th>
                <th className="pb-2 pr-4 font-medium">{t('common:col.type')}</th>
                <th className="pb-2 font-medium text-right">{t('capacity.utilization')}</th>
              </tr>
            </thead>
            <tbody>
              {capacity.targets.map((target) => {
                const isFlagged = target.flagged
                const rowClass = isFlagged
                  ? 'border-b border-gray-100 dark:border-gray-800 text-amber-700 dark:text-amber-400'
                  : 'border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200'
                return (
                  <tr key={target.name} className={rowClass} data-flagged={isFlagged || undefined}>
                    <td className="py-1.5 pr-4 font-medium">{target.name}</td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{target.type}</td>
                    <td className="py-1.5 text-right">
                      {fmtPercentValue(target.utilizationPct, locale)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
