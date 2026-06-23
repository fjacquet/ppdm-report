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

  it('jobs: detail DPN-Summary buckets, restore excluded, capped false', () => {
    const j = view().jobs
    expect(j.counts).toEqual({ SUCCESS: 2, EXCEPTION: 1, FAILED: 1 })
    expect(j.total).toBe(4)
    expect(j.successPct).toBeCloseTo(0.5, 6)
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

  it('capacity: latest-date node utilization ×100, flagged at >= 80, mtreeCount 0', () => {
    const cap = view().capacity
    // Node 0: latest row has 0.8 → ×100 = 80, flagged: true (80 >= FLAG_THRESHOLD_PCT 80)
    // Node 1: only row has 0.5 → ×100 = 50, flagged: false
    expect(cap.targets).toEqual([
      { name: 'Avamar node 0', type: 'Avamar grid node', utilizationPct: 80, flagged: true },
      { name: 'Avamar node 1', type: 'Avamar grid node', utilizationPct: 50, flagged: false },
    ])
    expect(cap.mtreeCount).toBe(0)
    expect(cap.flagged).toEqual([
      { name: 'Avamar node 0', type: 'Avamar grid node', utilizationPct: 80, flagged: true },
    ])
  })

  it('inUse = detail Policy Types (GC + No Plug-in excluded)', () => {
    expect(view().inUse).toEqual(['Linux VMware Image', 'Windows File System'])
  })

  it('idleAgents = disabled groups (domain-disambiguated)', () => {
    expect(view().idleAgents).toEqual(['Default Group', 'Default Virtual Machine Group (/dc1)'])
  })

  it('policies = distinct Group Name with per-group hosts + capacity', () => {
    const p = view().policies
    expect(p.count).toBe(3)
    expect(p.byPurpose).toEqual({})
    expect(p.perPolicy).toContainEqual({
      name: 'G1',
      purpose: '',
      assetCount: 2,
      protectionCapacityGb: 30,
    })
  })

  it('front-end volumetry per Application (base-2 GiB)', () => {
    const fe = view().frontEnd
    expect(fe.byType).toContainEqual({ type: 'Linux VMware Image', protectedDiscoveredGb: 125 })
    expect(fe.byType).toContainEqual({ type: 'Windows File System', protectedDiscoveredGb: 50 })
  })

  it('replication resilience populated; provenance marks compliance + frontEnd available', () => {
    const v = view()
    expect(v.compliance.replicatedPct).toBeCloseTo(0.9, 6)
    expect(v.compliance.immutablePct).toBe(0)
    expect(v.provenance.coverageByType.available).toBe(false)
    expect(v.provenance.compliance.available).toBe(true)
    expect(v.provenance.frontEnd.available).toBe(true)
    expect(v.provenance.gapsList.available).toBe(true)
    expect(v.provenance.storageTargets.available).toBe(true)
  })
})
