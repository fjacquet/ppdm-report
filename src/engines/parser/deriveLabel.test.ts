import { describe, expect, it } from 'vitest'
import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { appHostName, appVersion, deriveLabel, withUniqueLabel } from './deriveLabel'

function wbWithSysInfo(row: Record<string, string>): RawWorkbook {
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: {
      'System Information': {
        name: 'System Information',
        headers: Object.keys(row),
        rows: [row],
        capped: false,
      },
    },
    warnings: [],
  }
}

function wbWith(sysRow: Record<string, string> | null, customer = ''): RawWorkbook {
  const sheets: Record<string, SheetData> = {}
  if (sysRow) {
    sheets['System Information'] = {
      name: 'System Information',
      headers: Object.keys(sysRow),
      rows: [sysRow],
      capped: false,
    }
  }
  return {
    meta: { projectId: '', customer, collectorBuild: '', capturedAt: '', baseTen: true },
    sheets,
    warnings: [],
  }
}

describe('deriveLabel helpers', () => {
  it('reads the appliance host name', () => {
    expect(
      appHostName(wbWith({ 'Host Name': 'ppdm-paris', 'PowerProtect Version': '19.22' })),
    ).toBe('ppdm-paris')
  })

  it('reads the PowerProtect version', () => {
    expect(appVersion(wbWith({ 'Host Name': 'x', 'PowerProtect Version': '19.22.0-16' }))).toBe(
      '19.22.0-16',
    )
  })

  it('returns empty string when System Information is missing', () => {
    expect(appHostName(wbWith(null))).toBe('')
    expect(appVersion(wbWith(null))).toBe('')
  })

  it('derives label from host name first', () => {
    expect(deriveLabel(wbWith({ 'Host Name': 'ppdm-paris' }, 'ACME'), 'paris.xlsx')).toBe(
      'ppdm-paris',
    )
  })

  it('falls back to customer, then filename', () => {
    expect(deriveLabel(wbWith(null, 'ACME'), 'paris.xlsx')).toBe('ACME')
    expect(deriveLabel(wbWith(null, ''), 'paris.xlsx')).toBe('paris')
  })

  it('ignores whitespace-only customer and falls back to filename', () => {
    expect(deriveLabel(wbWith(null, '   '), 'paris.xlsx')).toBe('paris')
  })

  it('suffixes colliding labels', () => {
    expect(withUniqueLabel([], 'ppdm')).toBe('ppdm')
    expect(withUniqueLabel(['ppdm'], 'ppdm')).toBe('ppdm (2)')
    expect(withUniqueLabel(['ppdm', 'ppdm (2)'], 'ppdm')).toBe('ppdm (3)')
  })
})

describe('appVersion fallback', () => {
  it('prefers PowerProtect Version when present', () => {
    expect(appVersion(wbWithSysInfo({ 'PowerProtect Version': '19.19' }))).toBe('19.19')
  })

  it('falls back to Product Version when PowerProtect fields are N/A', () => {
    expect(
      appVersion(
        wbWithSysInfo({ 'Power Protect Version': 'N/A', 'Product Version': '19.18.0-14' }),
      ),
    ).toBe('19.18.0-14')
  })

  it('returns empty string when nothing usable is present', () => {
    expect(appVersion(wbWithSysInfo({ 'Power Protect Version': 'N/A' }))).toBe('')
  })
})
