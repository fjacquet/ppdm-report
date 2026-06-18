import { describe, expect, it } from 'vitest'
import {
  fmtDate,
  fmtGhzValue,
  fmtInt,
  fmtPercentValue,
  fmtRatio,
  formatBytes,
  formatDate,
  formatNumber,
} from './format'

describe('fmtInt / formatNumber', () => {
  it('formats locale-aware integers', () => {
    expect(fmtInt(1234, 'en-US')).toBe('1,234')
  })
  it('returns the em-dash sentinel for non-finite input', () => {
    expect(fmtInt(Number.NaN)).toBe('—')
    expect(fmtInt(Number.POSITIVE_INFINITY)).toBe('—')
  })
  it('formatNumber is an alias for fmtInt', () => {
    expect(formatNumber(1234, 'en-US')).toBe('1,234')
    expect(formatNumber(Number.NaN)).toBe('—')
  })
})

describe('fmtGhzValue', () => {
  it('adaptive precision + GHz suffix', () => {
    expect(fmtGhzValue(230, 'en-US')).toBe('230 GHz')
    expect(fmtGhzValue(0.24, 'en-US')).toBe('0.2 GHz')
  })
  it('em-dash for non-finite', () => {
    expect(fmtGhzValue(Number.NaN)).toBe('—')
  })
})

describe('fmtPercentValue', () => {
  it('formats an already-percent value with one decimal + %', () => {
    expect(fmtPercentValue(12.34, 'en-US')).toBe('12.3 %')
  })
  it('em-dash for non-finite (never 0 / N/A)', () => {
    expect(fmtPercentValue(Number.NaN)).toBe('—')
  })
})

describe('fmtRatio', () => {
  it('formats X.X : 1, locale-aware separator', () => {
    expect(fmtRatio(4.2, 'en-US')).toBe('4.2 : 1')
    expect(fmtRatio(4.2, 'fr-FR')).toBe('4,2 : 1')
  })
  it('em-dash for non-finite or zero', () => {
    expect(fmtRatio(0)).toBe('—')
    expect(fmtRatio(Number.NaN)).toBe('—')
  })
})

describe('formatBytes — base-10 tiers (PPDM base-10 units)', () => {
  it('renders GB with /1e9 math (base-10)', () => {
    expect(formatBytes(2e9, 'en-US')).toBe('2.0 GB')
  })
  it('renders TB with /1e12 math (base-10)', () => {
    expect(formatBytes(3e12, 'en-US')).toBe('3.0 TB')
  })
  it('renders MB with /1e6 math (base-10)', () => {
    expect(formatBytes(5e6, 'en-US')).toBe('5.0 MB')
  })
  it('renders KB with /1e3 math (base-10)', () => {
    expect(formatBytes(2500, 'en-US')).toBe('2.5 KB')
  })
  it('renders B below 1 000', () => {
    expect(formatBytes(512, 'en-US')).toBe('512 B')
  })
  it('em-dash for non-finite', () => {
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

describe('fmtDate / formatDate', () => {
  it('formats an ISO date locale-aware', () => {
    expect(fmtDate('2026-05-17', 'en-US')).toBe('May 17, 2026')
  })
  it('em-dash sentinel for an unparseable input (never 0 / N/A — D-00)', () => {
    expect(fmtDate('not-a-date')).toBe('—')
    expect(fmtDate('')).toBe('—')
  })
  it('renders the calendar day regardless of host timezone (no UTC back-shift)', () => {
    expect(fmtDate('2026-01-01', 'en-US')).toBe('Jan 1, 2026')
    expect(fmtDate('2026-12-31', 'en-US')).toBe('Dec 31, 2026')
  })
  it('em-dash sentinel for overflow / malformed date components', () => {
    expect(fmtDate('2026-02-30')).toBe('—') // Feb 30 does not exist
    expect(fmtDate('2026-13-01')).toBe('—') // month 13
    expect(fmtDate('2026-05-17T00:00:00Z')).toBe('—') // not bare YYYY-MM-DD
  })
  it('formatDate is an alias for fmtDate', () => {
    expect(formatDate('2026-05-17', 'en-US')).toBe('May 17, 2026')
    expect(formatDate('bad')).toBe('—')
  })
})
