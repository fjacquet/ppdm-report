import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt, formatBytes, gbToBytes } from '../../utils/format'

interface GapsSectionProps {
  view: ReportView
}

export function GapsSection({ view }: GapsSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language

  const totalBytes = gbToBytes(view.gaps.totalCapacityGb)
  const { top, count } = view.gaps

  return (
    <section aria-label={t('dashboard:gaps.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:gaps.title')}
      </h2>

      {/* KPI row */}
      <div className="mb-4 flex gap-8">
        <div>
          <p className="text-3xl font-bold text-red-500">{formatBytes(totalBytes, locale)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('dashboard:gaps.unprotectedTb')}
          </p>
        </div>
        <div>
          <p className="text-3xl font-bold text-red-500">{fmtInt(count, locale)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard:gaps.assets')}</p>
        </div>
      </div>

      {/* Top-N table */}
      {top.items.length > 0 && (
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
                // Unprotected assets can share a name (e.g. "X:\\") with no stable id, so the
                // index keeps React keys unique; the top-N list is static per render (remounts on upload).
                const rowKey = `${item?.name}-${index}`
                return (
                  <tr
                    key={rowKey}
                    className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                  >
                    <td className="py-1.5 pr-4">{item?.name}</td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{item?.type}</td>
                    <td className="py-1.5 text-right">
                      {formatBytes(gbToBytes(item?.sizeGb ?? 0), locale)}
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
      )}
    </section>
  )
}
