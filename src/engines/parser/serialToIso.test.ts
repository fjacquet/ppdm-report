import { describe, expect, it } from 'vitest'
import { serialToIso } from './serialToIso'

describe('serialToIso', () => {
  it('converts the Unix epoch serial (25569) to 1970-01-01', () => {
    expect(serialToIso(25569).slice(0, 10)).toBe('1970-01-01')
  })

  it('converts the WHO sample capture serial to mid-June 2026', () => {
    // 46188.59040939815 from the Details sheet
    expect(serialToIso(46188.59040939815).slice(0, 7)).toBe('2026-06')
  })

  it('returns a valid ISO-8601 string', () => {
    expect(serialToIso(46188).endsWith('Z')).toBe(true)
  })
})
