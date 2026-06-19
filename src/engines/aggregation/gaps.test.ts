import { describe, expect, it } from 'vitest'
import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { findGaps } from './gaps'

function wb(rows: Array<Record<string, string>>): RawWorkbook {
  const sheet: SheetData = {
    name: 'Unprotected Assets',
    headers: ['Name', 'Type', 'Size (GB)'],
    rows,
    capped: false,
  }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: { 'Unprotected Assets': sheet },
    warnings: [],
  }
}

describe('findGaps', () => {
  it('sums capacity and returns the top N unprotected by size', () => {
    const g = findGaps(
      wb([
        { Name: 'a', Type: 'VM', 'Size (GB)': '100' },
        { Name: 'b', Type: 'VM', 'Size (GB)': '300' },
        { Name: 'c', Type: 'VM', 'Size (GB)': '50' },
      ]),
      2,
    )
    expect(g.count).toBe(3)
    expect(g.totalCapacityGb).toBe(450)
    expect(g.top.items.map((x) => x.name)).toEqual(['b', 'a'])
    expect(g.top.total).toBe(3)
    expect(g.top.shown).toBe(2)
  })

  it('returns zeros and empty top when the sheet is absent', () => {
    const g = findGaps({
      meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
      sheets: {},
      warnings: [],
    })
    expect(g.count).toBe(0)
    expect(g.totalCapacityGb).toBe(0)
    expect(g.top.items).toEqual([])
  })
})
