import { describe, expect, it } from 'vitest'
import { MIDNIGHT_EXECUTIVE_DARK, MIDNIGHT_EXECUTIVE_LIGHT } from './echartsTheme'

describe('echarts themes', () => {
  it('use Arial and sRGB hex (no oklch)', () => {
    for (const t of [MIDNIGHT_EXECUTIVE_LIGHT, MIDNIGHT_EXECUTIVE_DARK]) {
      expect(t.textStyle?.fontFamily).toMatch(/Arial/)
      expect(JSON.stringify(t)).not.toContain('oklch')
    }
  })
  it('light and dark differ in background', () => {
    expect(MIDNIGHT_EXECUTIVE_LIGHT.backgroundColor).not.toBe(
      MIDNIGHT_EXECUTIVE_DARK.backgroundColor,
    )
  })
})
