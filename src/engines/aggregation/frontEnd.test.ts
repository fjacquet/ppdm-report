import { describe, expect, it } from 'vitest'
import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { computeFrontEnd, emptyFrontEnd, mergeFrontEnd } from './frontEnd'

function sh(
  name: string,
  headers: string[],
  rows: Array<Record<string, string | number>>,
): SheetData {
  return { name, headers, rows, capped: false }
}
function rwb(sheets: Record<string, SheetData>): RawWorkbook {
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets,
    warnings: [],
  }
}

describe('frontEnd helpers', () => {
  it('emptyFrontEnd is an empty, zero value', () => {
    expect(emptyFrontEnd()).toEqual({ byType: [], excludedCount: 0 })
  })

  it('mergeFrontEnd unions types and sums defined fields, keeping undefined until a reporter', () => {
    const a = { byType: [{ type: 'VM', protectedFetbGb: 10 }], excludedCount: 1 }
    const b = {
      byType: [
        { type: 'VM', protectedFetbGb: 5, protectedDiscoveredGb: 20 },
        { type: 'FS', protectedFetbGb: 3 },
      ],
      excludedCount: 2,
    }
    const m = mergeFrontEnd([a, b])
    const vm = m.byType.find((r) => r.type === 'VM')
    expect(vm).toEqual({ type: 'VM', protectedFetbGb: 15, protectedDiscoveredGb: 20 })
    expect(m.byType.find((r) => r.type === 'FS')?.protectedFetbGb).toBe(3)
    expect(m.excludedCount).toBe(3)
  })
})

describe('computeFrontEnd', () => {
  it('sums discovered + FETB per type by protection status; EXCLUDED → count only', () => {
    const wb = rwb({
      'Virtual Machines': sh(
        'Virtual Machines',
        ['Protection Status', 'Discovered Size (GB)', 'Asset Protection Size (Licensed) (GB)'],
        [
          {
            'Protection Status': 'PROTECTED',
            'Discovered Size (GB)': 100,
            'Asset Protection Size (Licensed) (GB)': 60,
          },
          {
            'Protection Status': 'PROTECTED',
            'Discovered Size (GB)': 40,
            'Asset Protection Size (Licensed) (GB)': 25,
          },
          {
            'Protection Status': 'UNPROTECTED',
            'Discovered Size (GB)': 30,
            'Asset Protection Size (Licensed) (GB)': 0,
          },
          {
            'Protection Status': 'EXCLUDED',
            'Discovered Size (GB)': 999,
            'Asset Protection Size (Licensed) (GB)': 999,
          },
        ],
      ),
    })
    const vm = computeFrontEnd(wb, ['Virtual Machines']).byType[0]
    expect(vm?.protectedDiscoveredGb).toBe(140)
    expect(vm?.protectedFetbGb).toBe(85)
    expect(vm?.unprotectedDiscoveredGb).toBe(30)
    expect(vm?.unprotectedFetbGb).toBeUndefined() // assets present but FETB sums to 0
    expect(computeFrontEnd(wb, ['Virtual Machines']).excludedCount).toBe(1)
  })

  it('treats a present-but-uniformly-zero column as undefined (SQL discovered)', () => {
    const wb = rwb({
      'SQL Databases': sh(
        'SQL Databases',
        ['Protection Status', 'Asset Total Size (GB)', 'Protection Capacity (GB)'],
        [
          {
            'Protection Status': 'PROTECTED',
            'Asset Total Size (GB)': 0,
            'Protection Capacity (GB)': 15,
          },
          {
            'Protection Status': 'UNPROTECTED',
            'Asset Total Size (GB)': 0,
            'Protection Capacity (GB)': 2,
          },
        ],
      ),
    })
    const sql = computeFrontEnd(wb, ['SQL Databases']).byType[0]
    expect(sql?.protectedDiscoveredGb).toBeUndefined()
    expect(sql?.protectedFetbGb).toBe(15)
    expect(sql?.unprotectedFetbGb).toBe(2)
  })

  it('marks an absent size column undefined; empty bucket is a measured 0', () => {
    const wb = rwb({
      'File Systems': sh(
        'File Systems',
        ['Protection Status', 'Asset Total Discovered Size (GB)', 'Asset Licensed Size (GB)'],
        [
          {
            'Protection Status': 'PROTECTED',
            'Asset Total Discovered Size (GB)': 100,
            'Asset Licensed Size (GB)': 70,
          },
        ],
      ),
      NAS: sh('NAS', ['Protection Status'], [{ 'Protection Status': 'PROTECTED' }]),
    })
    const fe = computeFrontEnd(wb, ['File Systems', 'NAS'])
    const fs = fe.byType.find((r) => r.type === 'File Systems')
    expect(fs?.unprotectedDiscoveredGb).toBe(0) // no unprotected assets → measured 0
    const nas = fe.byType.find((r) => r.type === 'NAS')
    expect(nas?.protectedDiscoveredGb).toBeUndefined() // column absent
    expect(nas?.protectedFetbGb).toBeUndefined()
  })
})
