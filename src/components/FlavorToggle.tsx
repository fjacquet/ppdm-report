import { useTranslation } from 'react-i18next'
import type { Flavor } from '../store/reportStore'
import { useReportStore } from '../store/reportStore'

export function FlavorToggle() {
  const { t } = useTranslation('common')
  const flavor = useReportStore((s) => s.flavor)
  const setFlavor = useReportStore((s) => s.setFlavor)

  return (
    <div className="flex rounded-md overflow-hidden border border-slate-300 dark:border-slate-600">
      {(['assessment', 'ops'] as const satisfies Flavor[]).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setFlavor(f)}
          className={`px-3 py-1 text-sm font-medium transition-colors ${
            flavor === f
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          {t(`flavor.${f}`)}
        </button>
      ))}
    </div>
  )
}
