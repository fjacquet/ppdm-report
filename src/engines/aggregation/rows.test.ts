import { describe, expect, it } from 'vitest'
import { cellNum, cellStr, countBy } from './rows'

describe('cell accessors', () => {
  it('cellStr trims and returns "" for null/N-A/missing', () => {
    expect(cellStr({ a: '  hi ' }, 'a')).toBe('hi')
    expect(cellStr({ a: null }, 'a')).toBe('')
    expect(cellStr({}, 'a')).toBe('')
    expect(cellStr({ a: 'N/A' }, 'a')).toBe('')
  })

  it('cellNum parses numbers and strips commas; 0 for non-numeric', () => {
    expect(cellNum({ a: 12.5 }, 'a')).toBe(12.5)
    expect(cellNum({ a: '1,234.5' }, 'a')).toBe(1234.5)
    expect(cellNum({ a: 'N/A' }, 'a')).toBe(0)
    expect(cellNum({}, 'a')).toBe(0)
  })

  it('countBy tallies a column, skipping blanks', () => {
    const rows = [{ s: 'A' }, { s: 'A' }, { s: 'B' }, { s: 'N/A' }]
    expect(countBy(rows, 's')).toEqual({ A: 2, B: 1 })
  })
})
