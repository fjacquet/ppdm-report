import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

interface IdleAgentsSectionProps {
  view: ReportView
}

export function IdleAgentsSection({ view }: IdleAgentsSectionProps) {
  const { t, i18n } = useTranslation('dashboard')

  if (view.idleAgents.length === 0) return null

  return (
    <section aria-label={t('idle.title')}>
      <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('idle.title')}
      </h2>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        {fmtInt(view.idleAgents.length, i18n.language)} · {t('idle.subtitle')}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {view.idleAgents.map((name) => (
          <div
            key={name}
            className="rounded-lg border border-l-4 border-slate-200 border-l-blue-500 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:border-l-blue-400 dark:bg-slate-900 dark:text-slate-200"
          >
            {name}
          </div>
        ))}
      </div>
    </section>
  )
}
