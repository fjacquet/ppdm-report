import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { summaryView } from './summaryView'

const wb = normalizeWorkbook(new Uint8Array(readFileSync('ref/chuv-a1n01136i.xlsx')).buffer)
const v = summaryView(wb)

describe('summaryView — chuv-a1n01136i', () => {
  it('recovers overall coverage counts from System Configuration', () => {
    expect(v.coverage.overall.protected).toBe(1782)
    expect(v.coverage.overall.unprotected).toBe(43)
    expect(v.coverage.overall.excluded).toBe(30) // 1855 - 1782 - 43
  })

  it('recovers unprotected count and total capacity for gaps, with no asset list', () => {
    expect(v.gaps.count).toBe(43)
    expect(v.gaps.totalCapacityGb).toBeCloseTo(10222.09, 1) // VM unprotected capacity; others 0
    expect(v.gaps.top.items).toEqual([])
    expect(v.gaps.top.total).toBe(43)
  })

  it('recovers job success totals from Jobs Summary', () => {
    // Successful: Config 8 + Delete 1632 + Discover 60 + Protect 1993 + Replicate 1930 + DR 318 = 5941
    expect(v.jobs.counts.SUCCESS).toBe(5941)
    expect(v.jobs.capped).toBe(false)
    expect(v.jobs.successPct).toBeGreaterThan(0.99)
  })

  it('recovers policies (purpose from Category) and DD mtree count', () => {
    expect(v.policies.count).toBeGreaterThan(0)
    expect(v.capacity.mtreeCount).toBe(97)
  })

  it('maps in-use asset types to canonical agent sheets', () => {
    expect(v.inUse).toContain('Virtual Machines')
    expect(v.inUse).toContain('File Systems')
  })

  it('marks the four detail-only metrics unavailable', () => {
    expect(v.provenance.compliance.available).toBe(false)
    expect(v.provenance.gapsList.available).toBe(false)
    expect(v.provenance.coverageByType.available).toBe(false)
    expect(v.provenance.storageTargets.available).toBe(false)
    expect(v.coverage.byType).toEqual({})
    expect(v.capacity.targets).toEqual([])
  })
})
