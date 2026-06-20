import { describe, expect, it } from 'vitest'
import { networkerWorkbookBuffer } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { buildNetworkerView } from './buildNetworkerView'

const view = () => buildNetworkerView(normalizeWorkbook(networkerWorkbookBuffer()))

describe('buildNetworkerView', () => {
  it('reads meta (base-10 → baseTen true)', () => {
    const v = view()
    expect(v.meta.customer).toBe('NW-test')
    expect(v.meta.baseTen).toBe(true)
  })

  it('coverage: count-based from Clients Scheduled Backup, no by-type', () => {
    const c = view().coverage
    expect(c.overall.protected).toBe(2)
    expect(c.overall.unprotected).toBe(1)
    expect(c.overall.excluded).toBe(0)
    expect(c.overall.pct).toBeCloseTo(2 / 3, 6)
    expect(c.byType).toEqual({})
  })

  it('jobs: Completion Status distribution + success rate', () => {
    const j = view().jobs
    expect(j.counts).toEqual({ Succeeded: 3, Failed: 1 })
    expect(j.total).toBe(4)
    expect(j.successPct).toBeCloseTo(3 / 4, 6)
    expect(j.capped).toBe(false)
  })

  it('gaps: size-less unprotected-client list', () => {
    const g = view().gaps
    expect(g.count).toBe(1)
    expect(g.totalCapacityGb).toBeUndefined()
    expect(g.top.items).toEqual([{ name: 'c3', type: 'Filesystem', sizeGb: undefined }])
  })

  it('capacity: Data Domain Used/Total utilization, flag at >=80, distinct mtrees', () => {
    const cap = view().capacity
    expect(cap.targets).toHaveLength(2)
    expect(cap.targets[0]).toMatchObject({ name: 'dd1', type: 'DD6400', flagged: false })
    expect(cap.targets[0]?.utilizationPct).toBeCloseTo((73000 / 164000) * 100, 4)
    expect(cap.targets[1]).toMatchObject({ name: 'dd2', utilizationPct: 90, flagged: true })
    expect(cap.flagged.map((t) => t.name)).toEqual(['dd2'])
    expect(cap.mtreeCount).toBe(2)
  })

  it('inUse = workloads with capacity>0; idleAgents = workloads with capacity 0', () => {
    const v = view()
    expect(v.inUse).toEqual(['Filesystem', 'Oracle RMAN'])
    expect(v.idleAgents).toEqual(['SQL', 'VMware'])
  })

  it('policies = distinct Policy Name count', () => {
    const p = view().policies
    expect(p.count).toBe(2)
    expect(p.byPurpose).toEqual({})
    expect(p.perPolicy).toEqual([])
  })

  it('compliance: immutable from retention lock, replicated from clone status, level mix', () => {
    const c = view().compliance
    expect(c.immutableCount).toBe(1)
    expect(c.immutablePct).toBeCloseTo(1 / 2, 6)
    expect(c.replicatedCount).toBe(1)
    expect(c.replicatedPct).toBeCloseTo(1 / 3, 6)
    expect(c.appConsistentPct).toBe(0)
    expect(c.backupLevelMix).toEqual({ Incr: 1, Full: 2 })
    expect(c.windowSize).toBe(3)
  })

  it('provenance: coverageByType unavailable; gaps/compliance/storageTargets available', () => {
    const p = view().provenance
    expect(p.coverageByType.available).toBe(false)
    expect(p.gapsList.available).toBe(true)
    expect(p.compliance.available).toBe(true)
    expect(p.compliance.assetsTotal).toBe(3)
    expect(p.storageTargets.available).toBe(true)
  })
})
