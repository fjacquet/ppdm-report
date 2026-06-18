import { useTranslation } from 'react-i18next'
import { useExport } from '../hooks/useExport'
import { useReportView } from '../hooks/useReportView'

const BTN =
  'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400'

/** PPTX + HTML export buttons. Renders only when a report is loaded. */
export function ExportButtons() {
  const { t } = useTranslation('common')
  const { run, busy } = useExport()
  const view = useReportView()
  if (!view) return null

  return (
    <div className="flex gap-2" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <button
        type="button"
        className={BTN}
        disabled={busy !== null}
        onClick={() => void run('pptx')}
      >
        {busy === 'pptx' ? '…' : t('export.pptx')}
      </button>
      <button
        type="button"
        className={BTN}
        disabled={busy !== null}
        onClick={() => void run('html')}
      >
        {busy === 'html' ? '…' : t('export.html')}
      </button>
    </div>
  )
}
