import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTranslation } from 'react-i18next'

/** Toast prompting the user to reload when a new app version is available. */
export function PwaUpdater() {
  const { t } = useTranslation('common')
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <span className="text-slate-800 dark:text-slate-100">{t('update.available')}</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
      >
        {t('update.reload')}
      </button>
    </div>
  )
}
