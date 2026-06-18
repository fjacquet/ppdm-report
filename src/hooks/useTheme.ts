import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'ppdm-report-theme'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

const isPreference = (v: unknown): v is ThemePreference =>
  v === 'auto' || v === 'light' || v === 'dark'

const readStoredPreference = (): ThemePreference => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    // Safari private mode throws on localStorage access. Fall through.
  }
  return 'auto'
}

const persistPreference = (pref: ThemePreference): void => {
  try {
    if (pref === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // Same Safari private mode caveat — silent failure is fine, the
    // preference still applies for the lifetime of the tab.
  }
}

const applyClass = (resolved: ResolvedTheme): void => {
  const cls = document.documentElement.classList
  if (resolved === 'dark') cls.add('dark')
  else cls.remove('dark')
}

const osPrefersDark = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MEDIA_QUERY).matches
}

const computeResolved = (pref: ThemePreference): ResolvedTheme => {
  if (pref === 'light' || pref === 'dark') return pref
  return osPrefersDark() ? 'dark' : 'light'
}

/**
 * 3-state theme preference (`auto` / `light` / `dark`) backed by
 * `localStorage['ppdm-report-theme']`. `auto` follows the OS via `matchMedia`
 * with reactive updates; `light` / `dark` override.
 *
 * Returns `{ theme, resolved, setTheme }` where `theme` is the stored
 * preference and `resolved` is the effective value after auto→system lookup.
 */
export function useTheme(): {
  theme: ThemePreference
  resolved: ResolvedTheme
  setTheme(t: ThemePreference): void
} {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredPreference())
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    computeResolved(readStoredPreference()),
  )

  // Apply the class + persist on every preference change.
  useEffect(() => {
    const next = computeResolved(theme)
    setResolved(next)
    applyClass(next)
    persistPreference(theme)
  }, [theme])

  // Subscribe to OS changes — only relevant when theme === 'auto'.
  useEffect(() => {
    if (theme !== 'auto') return
    const mq = window.matchMedia(MEDIA_QUERY)
    const handler = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? 'dark' : 'light'
      setResolved(next)
      applyClass(next)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((t: ThemePreference) => {
    if (!isPreference(t)) return
    setThemeState(t)
  }, [])

  return { theme, resolved, setTheme }
}
