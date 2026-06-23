import { describe, expect, it } from 'vitest'
import {
  fmtDate,
  fmtInt,
  fmtNum,
  fmtPercent,
  fmtPercentValue,
  fmtPercentWhole,
  fmtRatio,
  formatBytes,
  formatDate,
  formatGbOrUnknown,
  formatNumber,
  gbToBytes,
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

describe('fmtPercent', () => {
  it('formats a 0..1 ratio as a localized percent with one decimal', () => {
    expect(fmtPercent(0.234, 'en-US')).toBe('23.4%')
  })
  it('em-dash for non-finite input', () => {
    expect(fmtPercent(Number.NaN)).toBe('—')
    expect(fmtPercent(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('fmtPercentWhole', () => {
  it('formats a 0..1 ratio as a localized percent with no decimals', () => {
    expect(fmtPercentWhole(0.234, 'en-US')).toBe('23%')
  })
  it('em-dash for non-finite input', () => {
    expect(fmtPercentWhole(Number.NaN)).toBe('—')
    expect(fmtPercentWhole(Number.POSITIVE_INFINITY)).toBe('—')
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

describe('formatGbOrUnknown', () => {
  it('formats a number as bytes', () => {
    expect(formatGbOrUnknown(1, 'en', 'Size unknown')).toBe(formatBytes(gbToBytes(1), 'en'))
  })
  it('returns the unknown label when undefined', () => {
    expect(formatGbOrUnknown(undefined, 'en', 'Size unknown')).toBe('Size unknown')
  })
})

describe('base-2 byte formatting', () => {
  it('formatBytes base-2 uses GiB/TiB tiers', () => {
    expect(formatBytes(2 ** 30, 'en-US', false)).toBe('1.0 GiB')
    expect(formatBytes(2 ** 40, 'en-US', false)).toBe('1.0 TiB')
  })

  it('gbToBytes base-2 multiplies by 2^30', () => {
    expect(gbToBytes(1, false)).toBe(2 ** 30)
    // round-trip: 125 GiB → "125.0 GiB"
    expect(formatBytes(gbToBytes(125, false), 'en-US', false)).toBe('125.0 GiB')
  })

  it('default stays base-10', () => {
    expect(formatBytes(1e9, 'en-US')).toBe('1.0 GB')
    expect(gbToBytes(1)).toBe(1e9)
  })

  it('fmtNum formats a locale decimal', () => {
    expect(fmtNum(24.49, 'en-US', 1)).toBe('24.5')
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
