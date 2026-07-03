import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { networkerHygiene } from './hygiene'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('networkerHygiene', () => {
  it('a license with no expiration date is ok, counted, no cleanup', () => {
    const h = networkerHygiene(
      wb({
        Licenses: [
          ['License Name', 'Enabler Code', 'Expiration Date'],
          ['NetWorker Server', 'ABC123', 'Authorized - No expiration date'],
        ],
      }),
    )
    expect(h.items).toEqual([
      {
        kind: 'license',
        name: 'NetWorker Server',
        detail: 'ABC123',
        licenseStatus: 'ok',
      },
    ])
    expect(h.countByKind.license).toBe(1)
    expect(h.cleanupTotal).toBe(0)
    expect(h.expiredLicenses).toBe(0)
    expect(h.expiringLicenses).toBe(0)
  })

  it('classifies expired / expiring / ok against the workbook capturedAt', () => {
    // Details.Date = serial 45000 -> capturedAt 2023-03-15
    const h = networkerHygiene(
      wb({
        Details: [
          ['Project Name', 'NW-fixture'],
          ['Date', 45000],
        ],
        Licenses: [
          ['License Name', 'Enabler Code', 'Expiration Date'],
          ['Expired License', 'EXP1', 44990], // 10 days before capturedAt
          ['Expiring License', 'EXP2', 45010], // 10 days after, within 90-day window
          ['OK License', 'EXP3', 45100], // 100 days after, outside window
        ],
      }),
    )

    expect(h.items).toHaveLength(3)
    expect(h.countByKind.license).toBe(3)
    expect(h.expiredLicenses).toBe(1)
    expect(h.expiringLicenses).toBe(1)

    const byName = Object.fromEntries(h.items.map((i) => [i.name, i.licenseStatus]))
    expect(byName['Expired License']).toBe('expired')
    expect(byName['Expiring License']).toBe('expiring')
    expect(byName['OK License']).toBe('ok')
  })

  it('missing Licenses sheet yields zero items', () => {
    const h = networkerHygiene(
      wb({
        Details: [
          ['Project Name', 'NW-empty'],
          ['Date', 45000],
        ],
      }),
    )
    expect(h.items).toEqual([])
    expect(h.cleanupTotal).toBe(0)
  })
})
