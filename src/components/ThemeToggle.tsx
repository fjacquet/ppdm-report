import { useTranslation } from 'react-i18next'
import type { ThemePreference } from '../hooks/useTheme'
import { useTheme } from '../hooks/useTheme'

const CYCLE: Record<ThemePreference, ThemePreference> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto',
}

export function ThemeToggle() {
  const { t } = useTranslation('common')
  const { theme, setTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={() => setTheme(CYCLE[theme])}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
    >
      {t('theme.label')}: {t(`theme.${theme}`)}
    </button>
  )
}
