import { useTranslation } from 'react-i18next'

interface WarningsBannerProps {
  warnings: string[]
}

/** Amber caveats panel for data warnings (capped windows, merge notes). */
export function WarningsBanner({ warnings }: WarningsBannerProps) {
  const { t } = useTranslation('common')
  const unique = [...new Set(warnings)]
  if (unique.length === 0) return null

  return (
    <section
      aria-label={t('warnings.title')}
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <p className="mb-2 text-sm font-semibold">
        <span aria-hidden="true">⚠</span> {t('warnings.title')}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {unique.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </section>
  )
}
