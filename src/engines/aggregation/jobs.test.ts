import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { computeJobs } from './jobs'

function wb(rows: Array<Record<string, string>>, capped: boolean): ParsedWorkbook {
  const sheet: SheetData = { name: 'Protection Job Activities', headers: ['Result'], rows, capped }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: { 'Protection Job Activities': sheet },
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('computeJobs', () => {
  it('tallies results, computes success %, and propagates the cap flag', () => {
    const j = computeJobs(
      wb(
        [
          ...Array(9297).fill({ Result: 'SUCCESS' }),
          ...Array(635).fill({ Result: 'RETRIED' }),
          ...Array(66).fill({ Result: 'SKIPPED' }),
          ...Array(2).fill({ Result: 'CANCELED' }),
        ],
        true,
      ),
    )
    expect(j.total).toBe(10000)
    expect(j.counts.SUCCESS).toBe(9297)
    expect(j.successPct).toBeCloseTo(0.9297, 4)
    expect(j.capped).toBe(true)
    expect(j.windowSize).toBe(10000)
  })

  it('is safe when the sheet is absent', () => {
    const j = computeJobs({
      meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
      sheets: {},
      inUse: [],
      idleAgents: [],
      warnings: [],
    })
    expect(j.total).toBe(0)
    expect(j.successPct).toBe(0)
    expect(j.capped).toBe(false)
  })
})
