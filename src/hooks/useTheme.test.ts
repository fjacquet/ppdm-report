import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTheme } from './useTheme'

const STORAGE_KEY = 'ppdm-report-theme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to `auto` theme when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('auto')
  })

  it('reads a stored `dark` theme from localStorage[ppdm-report-theme]', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(result.current.resolved).toBe('dark')
  })

  it('setTheme(dark) writes to localStorage and adds the dark class', () => {
    const { result } = renderHook(() => useTheme())
    act(() => {
      result.current.setTheme('dark')
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme(light) removes the dark class', () => {
    document.documentElement.classList.add('dark')
    const { result } = renderHook(() => useTheme())
    act(() => {
      result.current.setTheme('light')
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setTheme(auto) removes the persisted key', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useTheme())
    act(() => {
      result.current.setTheme('auto')
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.theme).toBe('auto')
  })

  it('auto theme resolves via matchMedia', () => {
    // The matchMedia stub in src/test/setup.ts returns `matches: false`, so
    // auto resolves to `light`.
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('auto')
    expect(result.current.resolved).toBe('light')
  })
})
