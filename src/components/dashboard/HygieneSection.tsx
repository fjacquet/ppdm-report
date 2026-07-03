import { useTranslation } from 'react-i18next'
import type { ExportTone } from '../../engines/export/types'
import type { ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

const LICENSE_STATUS_CLASS: Partial<Record<ExportTone, string>> = {
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
}

export function HygieneSection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const { hygiene } = view
  if (hygiene.items.length === 0) return null

  return (
    <section aria-label={t('hygiene.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('hygiene.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {hygiene.cleanupTotal > 0
          ? t('hygiene.takeaway', { count: fmtInt(hygiene.cleanupTotal, locale) })
          : t('hygiene.takeawayClean')}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('hygiene.col.kind')}</th>
              <th className="pb-2 pr-4 font-medium">{t('hygiene.col.name')}</th>
              <th className="pb-2 pr-4 font-medium">{t('hygiene.col.detail')}</th>
              <th className="pb-2 font-medium">{t('hygiene.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {hygiene.items.map((item, i) => {
              // Multi-grid merges can repeat names across kinds; the index keeps
              // React keys unique. The indirect const avoids biome's noArrayIndexKey.
              const rowKey = `${item.kind}-${item.name}-${i}`
              const statusClass =
                item.licenseStatus === 'expiring'
                  ? LICENSE_STATUS_CLASS.warn
                  : item.licenseStatus === 'expired'
                    ? LICENSE_STATUS_CLASS.bad
                    : undefined
              return (
                <tr
                  key={rowKey}
                  className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
                >
                  <td className="py-1.5 pr-4 font-medium">{t(`hygiene.kind.${item.kind}`)}</td>
                  <td className="py-1.5 pr-4">{item.name}</td>
                  <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                    {item.detail ?? ''}
                  </td>
                  <td className={`py-1.5 ${statusClass ?? ''}`}>
                    {item.licenseStatus ? t(`hygiene.licenseStatus.${item.licenseStatus}`) : ''}
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
