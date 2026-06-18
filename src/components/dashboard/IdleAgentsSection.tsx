import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'

interface IdleAgentsSectionProps {
  view: ReportView
}

export function IdleAgentsSection({ view }: IdleAgentsSectionProps) {
  const { t } = useTranslation('dashboard')

  if (view.idleAgents.length === 0) return null

  return (
    <section aria-label={t('idle.title')}>
      <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('idle.title')}
      </h2>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t('idle.subtitle')}</p>
      <ul className="flex flex-wrap gap-2">
        {view.idleAgents.map((name) => (
          <li
            key={name}
            className="rounded-full bg-yellow-100 px-3 py-1 text-sm text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
          >
            {name}
          </li>
        ))}
      </ul>
    </section>
  )
}
