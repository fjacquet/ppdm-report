import { describe, expect, it } from 'vitest'
import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { summarizePolicies } from './policies'

function wb(rows: Array<Record<string, string>>): RawWorkbook {
  const sheet: SheetData = {
    name: 'Policies',
    headers: ['Name', 'Purpose', 'Number of Assets', 'Total Asset Protection Capacity (GB)'],
    rows,
    capped: false,
  }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: { Policies: sheet },
    warnings: [],
  }
}

describe('summarizePolicies', () => {
  it('counts policies, tallies purposes, and maps per-policy rows', () => {
    const p = summarizePolicies(
      wb([
        {
          Name: 'SQL - Prod',
          Purpose: 'CENTRALIZED',
          'Number of Assets': '380',
          'Total Asset Protection Capacity (GB)': '1234.5',
        },
        {
          Name: 'Exclusions',
          Purpose: 'EXCLUSION',
          'Number of Assets': '0',
          'Total Asset Protection Capacity (GB)': '0',
        },
      ]),
    )
    expect(p.count).toBe(2)
    expect(p.byPurpose).toEqual({ CENTRALIZED: 1, EXCLUSION: 1 })
    expect(p.perPolicy[0]).toEqual({
      name: 'SQL - Prod',
      purpose: 'CENTRALIZED',
      assetCount: 380,
      protectionCapacityGb: 1234.5,
    })
  })
})
