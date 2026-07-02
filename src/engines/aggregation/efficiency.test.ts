import { describe, expect, it } from 'vitest'
import {
  classifyReplicationStatus,
  computeDedupeCommon,
  computeReplicationHealth,
  emptyEfficiency,
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
