import type { ThemePreference } from '../hooks/useTheme'
import { useTheme } from '../hooks/useTheme'

const CYCLE: Record<ThemePreference, ThemePreference> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto',
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button type="button" onClick={() => setTheme(CYCLE[theme])}>
      Theme: {theme}
    </button>
  )
}
