import { useTranslation } from 'react-i18next'
import { useReportStore } from '../store/reportStore'
import { fmtDate } from '../utils/format'

/** Chip strip of loaded source servers, with per-server remove and clear-all. */
export function ServerList() {
  const { t, i18n } = useTranslation('common')
  const servers = useReportStore((s) => s.servers)
  const removeServer = useReportStore((s) => s.removeServer)
  const clear = useReportStore((s) => s.clear)
  if (servers.length === 0) return null

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          {t('servers.title')} ({servers.length})
        </p>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {t('servers.clearAll')}
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {servers.map((s) => {
          const captured = fmtDate(s.workbook.meta.capturedAt.slice(0, 10), i18n.language)
          return (
            <li
              key={s.label}
              className="flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="font-medium">{s.label}</span>
              {captured !== '—' && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{captured}</span>
              )}
              <button
                type="button"
                aria-label={t('servers.remove', { label: s.label })}
                onClick={() => removeServer(s.label)}
                className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
