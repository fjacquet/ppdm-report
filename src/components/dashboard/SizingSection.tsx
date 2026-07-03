import { useTranslation } from 'react-i18next'
import { buildSizingRows } from '../../engines/export/sizingRows'
import type { ReportView } from '../../types/reportView'

interface SizingSectionProps {
  view: ReportView
}

/** Sizing-inputs summary for a presales architect: render-only table pulled from
 * fields already computed by other metric families (frontEnd/efficiency/
 * capacityTrend/reliability/hygiene) — no new engine computation. Suppressed
 * entirely when no row qualifies. */
export function SizingSection({ view }: SizingSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const rows = buildSizingRows(view, t, locale)
  if (rows.length === 0) return null

  return (
    <section aria-label={t('sizing.title')}>
      <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('sizing.title')}
      </h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('sizing.subtitle')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('sizing.col.metric')}</th>
              <th className="pb-2 pr-4 font-medium">{t('sizing.col.value')}</th>
              <th className="pb-2 font-medium">{t('sizing.col.basis')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{row.label}</td>
                <td className="py-1.5 pr-4">{row.value}</td>
                <td className="py-1.5 text-gray-500 dark:text-gray-400">{row.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
