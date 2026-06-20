import { describe, expect, it } from 'vitest'
import { avamarWorkbookBuffer } from '../../test-helpers/workbooks'
import type { ReportView } from '../../types/reportView'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { buildAvamarView } from '../products/avamar/buildAvamarView'
import { mergeViews } from './mergeViews'
import { allAvailable, allUnavailable } from './provenance'

function detail(over: Partial<ReportView>): ReportView {
  return {
    meta: {
      projectId: 'p',
      customer: 'ACME',
      collectorBuild: 'b',
      capturedAt: '2026-01-01',
      baseTen: true,
    },
    inUse: [],
    idleAgents: [],
    warnings: [],
    coverage: {
      byType: {},
      overall: { protected: 0, unprotected: 0, excluded: 0, pct: 0, pctInclExcluded: 0 },
    },
    gaps: { count: 0, totalCapacityGb: 0, top: { items: [], total: 0, shown: 0 } },
    jobs: { counts: {}, total: 0, successPct: 0, capped: false, windowSize: 0 },
    compliance: {
      appConsistentPct: 0,
      immutablePct: 0,
      replicatedPct: 0,
      appConsistentCount: 0,
      immutableCount: 0,
      replicatedCount: 0,
      backupLevelMix: {},
      windowSize: 0,
      capped: false,
    },
    capacity: { targets: [], flagged: [], mtreeCount: 0 },
    policies: { count: 0, byPurpose: {}, perPolicy: [] },
    provenance: allAvailable(0),
    ...over,
  }
}

describe('mergeViews', () => {
  it('returns the single view unchanged', () => {
    const v = detail({})
    expect(mergeViews([v])).toBe(v)
  })

  it('sums overall coverage counts and re-finalizes pct', () => {
    const a = detail({
      coverage: {
        byType: {},
        overall: { protected: 8, unprotected: 2, excluded: 0, pct: 0.8, pctInclExcluded: 0.8 },
      },
    })
    const b = detail({
      coverage: {
        byType: {},
        overall: { protected: 2, unprotected: 8, excluded: 0, pct: 0.2, pctInclExcluded: 0.2 },
      },
    })
    const m = mergeViews([a, b])
    expect(m.coverage.overall.protected).toBe(10)
    expect(m.coverage.overall.pct).toBeCloseTo(0.5)
  })

  it('combines compliance by raw counts, not rounded pct', () => {
    const a = detail({
      compliance: {
        ...detail({}).compliance,
        immutableCount: 3,
        windowSize: 4,
        immutablePct: 0.75,
      },
    })
    const b = detail({
      compliance: {
        ...detail({}).compliance,
        immutableCount: 1,
        windowSize: 6,
        immutablePct: 1 / 6,
      },
    })
    const m = mergeViews([a, b])
    expect(m.compliance.immutablePct).toBeCloseTo(4 / 10)
  })

  it('computes provenance coverage across mixed servers', () => {
    const d = detail({ provenance: allAvailable(370) })
    const s = detail({ provenance: allUnavailable(3516) })
    const m = mergeViews([d, s, s, s])
    expect(m.provenance.compliance).toMatchObject({
      available: true,
      serversCovered: 1,
      serversTotal: 4,
      assetsCovered: 370,
      assetsTotal: 370 + 3516 * 3,
    })
  })

  it('multi-Avamar merge preserves plugin inUse and disabled-group idleAgents', () => {
    const v = buildAvamarView(normalizeWorkbook(avamarWorkbookBuffer()))
    const m = mergeViews([v, v])
    // inUse must contain Avamar plugin names (not silently erased by AGENT_SHEETS filter)
    expect(m.inUse).toContain('Linux VMware Image')
    // idleAgents must contain disabled-group names (not empty)
    expect(m.idleAgents).toContain('Default Group')
    expect(m.idleAgents).toContain('Default Virtual Machine Group (/dc1)')
    // idleAgents must NOT include anything that is in inUse
    for (const name of m.inUse) {
      expect(m.idleAgents).not.toContain(name)
    }
    // gaps.totalCapacityGb stays undefined for Avamar (no per-asset sizes)
    expect(m.gaps.totalCapacityGb).toBeUndefined()
    // gaps.count sums (2 + 2 = 4 from merging the view with itself)
    expect(m.gaps.count).toBe(v.gaps.count * 2)
    // coverage.overall.protected sums
    expect(m.coverage.overall.protected).toBe(v.coverage.overall.protected * 2)
  })
})
