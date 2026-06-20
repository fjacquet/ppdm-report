import { describe, expect, it } from 'vitest'
import { avamarWorkbookBuffer } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { buildAvamarView } from './buildAvamarView'

const view = () => buildAvamarView(normalizeWorkbook(avamarWorkbookBuffer()))

describe('buildAvamarView', () => {
  it('reads meta (base-2 → baseTen false)', () => {
    const v = view()
    expect(v.meta.customer).toBe('AVA-test')
    expect(v.meta.baseTen).toBe(false)
  })

  it('count-based coverage: protected/unprotected from NonRetired, excluded from Retired', () => {
    const c = view().coverage
    expect(c.overall.protected).toBe(6)
    expect(c.overall.unprotected).toBe(4)
    expect(c.overall.excluded).toBe(3)
    expect(c.overall.pct).toBeCloseTo(6 / 10, 6)
    expect(c.overall.pctInclExcluded).toBeCloseTo(6 / 13, 6)
    expect(c.byType).toEqual({})
  })

  it('jobs: Avamar-native buckets, success excludes exception+failed', () => {
    const j = view().jobs
    expect(j.counts).toEqual({ SUCCESS: 7, EXCEPTION: 1, FAILED: 2 })
    expect(j.total).toBe(10)
    expect(j.successPct).toBeCloseTo(7 / 10, 6)
    expect(j.capped).toBe(false)
  })

  it('gaps: size-less unprotected-client list', () => {
    const g = view().gaps
    expect(g.count).toBe(2)
    expect(g.totalCapacityGb).toBeUndefined()
    expect(g.top.items).toEqual([
      { name: '/clients/a', type: 'REGULAR', sizeGb: undefined },
      { name: '/clients/b', type: 'VREGULAR', sizeGb: undefined },
    ])
  })

  it('capacity: latest-date node utilization, mtreeCount 0', () => {
    const cap = view().capacity
    expect(cap.targets).toEqual([
      { name: 'Avamar node 0', type: 'Avamar grid node', utilizationPct: 0.8, flagged: false },
    ])
    expect(cap.mtreeCount).toBe(0)
    expect(cap.flagged).toEqual([])
  })

  it('inUse = plugins with count>0; idleAgents = disabled groups (domain-disambiguated)', () => {
    const v = view()
    expect(v.inUse).toEqual(['Linux VMware Image'])
    expect(v.idleAgents).toEqual(['Default Group', 'Default Virtual Machine Group (/dc1)'])
  })

  it('policies = distinct group count only', () => {
    const p = view().policies
    expect(p.count).toBe(2)
    expect(p.byPurpose).toEqual({})
    expect(p.perPolicy).toEqual([])
  })

  it('compliance is empty and provenance marks the right metrics', () => {
    const v = view()
    expect(v.compliance.windowSize).toBe(0)
    expect(v.compliance.immutablePct).toBe(0)
    expect(v.provenance.coverageByType.available).toBe(false)
    expect(v.provenance.gapsList.available).toBe(true)
    expect(v.provenance.compliance.available).toBe(false)
    expect(v.provenance.storageTargets.available).toBe(true)
  })
})
