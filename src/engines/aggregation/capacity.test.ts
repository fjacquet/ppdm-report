import { describe, expect, it } from 'vitest'
import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { computeCapacity } from './capacity'

function sheet(name: string, headers: string[], rows: Array<Record<string, string>>): SheetData {
  return { name, headers, rows, capped: false }
}

function wb(sheets: Record<string, SheetData>): RawWorkbook {
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets,
    warnings: [],
  }
}

describe('computeCapacity', () => {
  it('reads utilization, flags targets at/over the threshold, and counts mtrees', () => {
    const cap = computeCapacity(
      wb({
        'Storage Targets': sheet(
          'Storage Targets',
          ['Name', 'Type', 'Utilization (%)'],
          [
            { Name: 'dd1', Type: 'DATA_DOMAIN_SYSTEM', 'Utilization (%)': '87.6' },
            { Name: 'dd2', Type: 'DATA_DOMAIN_SYSTEM', 'Utilization (%)': '89.6' },
            { Name: 'arr', Type: 'GENERIC_NAS_APPLIANCE', 'Utilization (%)': 'N/A' },
          ],
        ),
        'Data Domain Mtrees': sheet(
          'Data Domain Mtrees',
          ['Name'],
          [{ Name: 'm1' }, { Name: 'm2' }],
        ),
      }),
      80,
    )
    expect(cap.targets).toHaveLength(3)
    expect(cap.flagged.map((t) => t.name)).toEqual(['dd1', 'dd2'])
    expect(cap.targets[2]?.utilizationPct).toBe(0) // N/A → 0, not flagged
    expect(cap.flagged.every((t) => t.flagged)).toBe(true)
    expect(cap.mtreeCount).toBe(2)
  })

  it('is safe when sheets are absent', () => {
    const cap = computeCapacity(wb({}))
    expect(cap.targets).toEqual([])
    expect(cap.flagged).toEqual([])
    expect(cap.mtreeCount).toBe(0)
  })
})
