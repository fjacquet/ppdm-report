import { describe, expect, it } from 'vitest'
import {
  classifyLicenseExpiry,
  computeHygiene,
  emptyHygiene,
  type HygieneItem,
  mergeHygiene,
} from './hygiene'

describe('computeHygiene', () => {
  it('counts items per kind; cleanupTotal excludes overtime + license', () => {
    const items: HygieneItem[] = [
      { kind: 'datasetUnused', name: 'ds1' },
      { kind: 'retentionUnused', name: 'ret1' },
      { kind: 'scheduleUnused', name: 'sch1' },
      { kind: 'clientInactive', name: 'cli1' },
      { kind: 'clientOvertime', name: 'over1' },
      { kind: 'license', name: 'lic1', licenseStatus: 'expired' },
      { kind: 'license', name: 'lic2', licenseStatus: 'expiring' },
      { kind: 'license', name: 'lic3', licenseStatus: 'ok' },
    ]
    const h = computeHygiene(items)
    expect(h.countByKind).toEqual({
      datasetUnused: 1,
      retentionUnused: 1,
      scheduleUnused: 1,
      clientInactive: 1,
      clientOvertime: 1,
      license: 3,
    })
    expect(h.cleanupTotal).toBe(4)
    expect(h.expiredLicenses).toBe(1)
    expect(h.expiringLicenses).toBe(1)
    expect(h.items).toBe(items)
  })

  it('emptyHygiene is inert', () => {
    const e = emptyHygiene()
    expect(e.items).toEqual([])
    expect(e.cleanupTotal).toBe(0)
    expect(e.expiredLicenses).toBe(0)
    expect(e.expiringLicenses).toBe(0)
    expect(e.countByKind).toEqual({
      datasetUnused: 0,
      retentionUnused: 0,
      scheduleUnused: 0,
      clientInactive: 0,
      clientOvertime: 0,
      license: 0,
    })
  })
})

describe('classifyLicenseExpiry', () => {
  const capturedAt = '2026-06-27T00:00:00.000Z'

  it('text with no parseable date returns ok with no expiresOn', () => {
    expect(classifyLicenseExpiry('Authorized - No expiration date', capturedAt)).toEqual({
      status: 'ok',
    })
  })

  it('serial 30 days after capturedAt is expiring', () => {
    // 2026-07-27 (30 days after capturedAt); serial computed from the Excel epoch 1899-12-30.
    const r = classifyLicenseExpiry('46230', capturedAt)
    expect(r.status).toBe('expiring')
    expect(r.expiresOn).toBe('2026-07-27')
  })

  it('serial 91 days after capturedAt is ok (past the 90-day window)', () => {
    // 2026-09-26 (91 days after capturedAt)
    const r = classifyLicenseExpiry('46291', capturedAt)
    expect(r.status).toBe('ok')
    expect(r.expiresOn).toBe('2026-09-26')
  })

  it('serial before capturedAt is expired', () => {
    // 2026-06-17 (10 days before capturedAt)
    const r = classifyLicenseExpiry('46190', capturedAt)
    expect(r.status).toBe('expired')
    expect(r.expiresOn).toBe('2026-06-17')
  })

  it('empty capturedAt with a valid date returns ok, still reporting expiresOn', () => {
    const r = classifyLicenseExpiry('46230', '')
    expect(r.status).toBe('ok')
    expect(r.expiresOn).toBe('2026-07-27')
  })

  it('parses a plain date string the same as its equivalent serial', () => {
    const r = classifyLicenseExpiry('2026-07-27', capturedAt)
    expect(r.status).toBe('expiring')
    expect(r.expiresOn).toBe('2026-07-27')
  })
})

describe('mergeHygiene', () => {
  it('is identity on a single element', () => {
    const one = computeHygiene([{ kind: 'datasetUnused', name: 'a' }])
    expect(mergeHygiene([one])).toBe(one)
  })

  it('returns emptyHygiene on an empty list', () => {
    expect(mergeHygiene([])).toEqual(emptyHygiene())
  })

  it('concatenates items and recounts across servers', () => {
    const a = computeHygiene([{ kind: 'datasetUnused', name: 'a1' }])
    const b = computeHygiene([
      { kind: 'datasetUnused', name: 'b1' },
      { kind: 'license', name: 'b2', licenseStatus: 'expired' },
    ])
    const m = mergeHygiene([a, b])
    expect(m.countByKind.datasetUnused).toBe(2)
    expect(m.countByKind.license).toBe(1)
    expect(m.expiredLicenses).toBe(1)
    expect(m.cleanupTotal).toBe(2)
    expect(m.items.length).toBe(3)
  })
})
