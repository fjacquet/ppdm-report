import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercent } from '../../utils/format'
import { KpiCard } from '../KpiCard'

interface JobsComplianceSectionProps {
  view: ReportView
}

export function JobsComplianceSection({ view }: JobsComplianceSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language

  const { jobs, compliance } = view

  const immutableTone = compliance.immutablePct === 0 ? 'bad' : 'ok'

  return (
    <section aria-label={t('dashboard:jobs.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:jobs.title')}
      </h2>

      {/* Jobs KPI */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          value={fmtPercent(jobs.successPct, locale)}
          label={t('dashboard:jobs.success')}
          tone="ok"
        />
        <KpiCard
          value={fmtInt(jobs.total, locale)}
          label={t('dashboard:jobs.total')}
          tone="muted"
        />
      </div>

      {/* Jobs result mix */}
      {Object.keys(jobs.counts).length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(jobs.counts).map(([status, count]) => (
                <tr key={status} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">{status}</td>
                  <td className="py-1 text-right font-semibold text-gray-900 dark:text-gray-100">
                    {fmtInt(count, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Capped caveat for jobs */}
      {jobs.capped && (
        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
          {t('common:capped', { n: fmtInt(jobs.windowSize, locale) })}
        </p>
      )}

      {/* Compliance section */}
      <h3 className="mb-3 mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:compliance.title')}
      </h3>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          value={fmtPercent(compliance.appConsistentPct, locale)}
          label={t('dashboard:compliance.appConsistent')}
          tone="ok"
        />
        <KpiCard
          value={fmtPercent(compliance.immutablePct, locale)}
          label={t('dashboard:compliance.immutable')}
          tone={immutableTone}
        />
        <KpiCard
          value={fmtPercent(compliance.replicatedPct, locale)}
          label={t('dashboard:compliance.replicated')}
          tone="ok"
        />
      </div>

      {/* Capped caveat for compliance */}
      {compliance.capped && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t('common:capped', { n: fmtInt(compliance.windowSize, locale) })}
        </p>
      )}
    </section>
  )
}
