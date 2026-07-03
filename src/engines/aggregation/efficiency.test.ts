import { describe, expect, it } from 'vitest'
import {
  classifyReplicationStatus,
  computeDedupeCommon,
  computeReplicationHealth,
  type Efficiency,
  emptyEfficiency,
  mergeEfficiency,
} from './efficiency'

const GIB = 2 ** 30

describe('computeDedupeCommon', () => {
  it('weights % Common by bytes processed and flags low-dedupe clients', () => {
    const r = computeDedupeCommon([
      { host: 'good', commonPct: 100, weightBytes: 9 * GIB },
      { host: 'poor', commonPct: 20, weightBytes: 1 * GIB },
    ])
    // (100×9 + 20×1) / 10 = 92
    expect(r.common && r.common.num / r.common.den).toBeCloseTo(92, 6)
    expect(r.lowDedupe.items).toEqual([{ host: 'poor', commonPct: 20, processedGb: 1 }])
  })

  it('a client below 1 GiB processed is never flagged (noise floor)', () => {
    const r = computeDedupeCommon([{ host: 'tiny', commonPct: 0, weightBytes: GIB / 2 }])
    expect(r.lowDedupe.total).toBe(0)
  })

  it('zero/absent weights never enter the sums; empty input yields no ratio', () => {
    const r = computeDedupeCommon([{ host: 'x', commonPct: 50, weightBytes: 0 }])
    expect(r.common).toBeUndefined()
    expect(computeDedupeCommon([]).common).toBeUndefined()
  })

  it('a client aggregates across its own samples before the low-dedupe check', () => {
    const r = computeDedupeCommon([
      { host: 'mixed', commonPct: 0, weightBytes: 1 * GIB },
      { host: 'mixed', commonPct: 100, weightBytes: 3 * GIB },
    ])
    // weighted 75% ≥ 50 → not flagged
    expect(r.lowDedupe.total).toBe(0)
  })
})

describe('replication health', () => {
  it('classifies the observed Avamar status strings', () => {
    expect(classifyReplicationStatus('Activity completed successfully.')).toBe('success')
    expect(classifyReplicationStatus('Activity completed with exceptions.')).toBe('exceptions')
    expect(classifyReplicationStatus('Partially completed replication activity.')).toBe('partial')
    expect(classifyReplicationStatus('Activity cancelled.')).toBe('cancelled')
    expect(classifyReplicationStatus('Activity failed - client error(s).')).toBe('failed')
    expect(classifyReplicationStatus('Activity failed - timed out before starting.')).toBe('failed')
  })

  it('sums counts per outcome; undefined on empty input', () => {
    const h = computeReplicationHealth([
      { status: 'Activity completed successfully.', count: 24738 },
      { status: 'Activity completed with exceptions.', count: 1438 },
      { status: 'Partially completed replication activity.', count: 164 },
      { status: 'Activity cancelled.', count: 35 },
      { status: 'Activity failed - client error(s).', count: 15 },
    ])
    expect(h?.counts).toEqual({
      success: 24738,
      exceptions: 1438,
      partial: 164,
      cancelled: 35,
      failed: 15,
    })
    expect(h?.total).toBe(26390)
    expect(computeReplicationHealth([])).toBeUndefined()
  })
})

describe('emptyEfficiency', () => {
  it('has no sub-metric', () => {
    expect(emptyEfficiency()).toEqual({})
  })
})

describe('mergeEfficiency', () => {
  it('is identity on a single element', () => {
    const one = { changeRate: { sentBytes: 1, processedBytes: 10 } }
    expect(mergeEfficiency([one])).toBe(one)
  })

  it('folds each sub-metric across the servers that have it', () => {
    const a: Efficiency = {
      dedupe: {
        common: { num: 900, den: 10 },
        lowDedupe: { items: [{ host: 'x', commonPct: 20, processedGb: 2 }], total: 1, shown: 1 },
      },
      changeRate: { sentBytes: 5, processedBytes: 100 },
      retention: {
        totalGbByBucket: { r30: 10, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
        perPolicyType: [
          { type: 'SQL', gbByBucket: { r30: 10, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 } },
        ],
      },
      replicationHealth: {
        counts: { success: 10, exceptions: 1, partial: 0, cancelled: 0, failed: 1 },
        total: 12,
      },
    }
    const b: Efficiency = {
      dedupe: {
        common: { num: 100, den: 10 },
        lowDedupe: { items: [{ host: 'y', commonPct: 40, processedGb: 5 }], total: 1, shown: 1 },
        global: { logicalGb: 1000, usedGb: 100 },
      },
      retention: {
        totalGbByBucket: { r30: 5, r60: 5, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
        perPolicyType: [],
      },
    }
    const m = mergeEfficiency([a, b])
    expect(m.dedupe?.common).toEqual({ num: 1000, den: 20 })
    expect(m.dedupe?.global).toEqual({ logicalGb: 1000, usedGb: 100 })
    expect(m.dedupe?.lowDedupe.total).toBe(2)
    expect(m.dedupe?.lowDedupe.items[0]?.host).toBe('x') // lowest commonality first
    expect(m.changeRate).toEqual({ sentBytes: 5, processedBytes: 100 }) // only a had it
    expect(m.retention?.totalGbByBucket).toEqual({
      r30: 15,
      r60: 5,
      r180: 0,
      r1y: 0,
      r7y: 0,
      r7yPlus: 0,
    })
    expect(m.retention?.perPolicyType).toHaveLength(1)
    expect(m.replicationHealth?.total).toBe(12)
    expect(m.encryption).toBeUndefined() // no server had it
  })
})
