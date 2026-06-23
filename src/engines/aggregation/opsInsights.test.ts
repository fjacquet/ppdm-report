import { describe, expect, it } from 'vitest'
import type { OpsInsights } from '../../types/reportView'
import { emptyOpsInsights, mergeOpsInsights } from './opsInsights'

const make = (over: Partial<OpsInsights>): OpsInsights => ({ ...emptyOpsInsights(), ...over })

describe('opsInsights aggregation', () => {
  it('emptyOpsInsights is fully empty', () => {
    const e = emptyOpsInsights()
    expect(e.agentVersions).toEqual([])
    expect(e.atRisk.overtime).toEqual({ items: [], total: 0, shown: 0 })
    expect(e.longestBackups).toEqual({ items: [], total: 0, shown: 0 })
  })

  it('mergeOpsInsights is identity on a single view', () => {
    const one = make({ agentVersions: [{ version: '19.4', count: 3 }] })
    expect(mergeOpsInsights([one])).toBe(one)
  })

  it('mergeOpsInsights sums versions and concatenates risk + longest lists', () => {
    const a = make({
      agentVersions: [{ version: '19.4', count: 3 }],
      atRisk: {
        overtime: { items: [{ name: 'c1' }], total: 1, shown: 1 },
        staleBackups: { items: [], total: 0, shown: 0 },
      },
      longestBackups: {
        items: [{ server: 's1', policyType: 'FS', durationHr: 10 }],
        total: 1,
        shown: 1,
      },
    })
    const b = make({
      agentVersions: [{ version: '19.4', count: 2 }],
      longestBackups: {
        items: [{ server: 's2', policyType: 'VM', durationHr: 20 }],
        total: 1,
        shown: 1,
      },
    })
    const m = mergeOpsInsights([a, b])
    expect(m.agentVersions).toEqual([{ version: '19.4', count: 5 }])
    expect(m.atRisk.overtime.total).toBe(1)
    expect(m.longestBackups.total).toBe(2)
    // longest sorted by duration desc → s2 (20h) first
    expect(m.longestBackups.items[0]?.server).toBe('s2')
  })
})
