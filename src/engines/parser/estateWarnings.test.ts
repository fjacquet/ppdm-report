import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, ServerWorkbook } from '../../types/ppdm'
import { estateWarnings } from './estateWarnings'

function wb(over: Partial<ParsedWorkbook> = {}): ParsedWorkbook {
  return {
    meta: {
      projectId: 'p',
      customer: 'ACME',
      collectorBuild: 'b',
      capturedAt: '2026-01-01',
      baseTen: true,
    },
    sheets: {},
    inUse: [],
    idleAgents: [],
    warnings: [],
    ...over,
  }
}
const srv = (label: string, workbook: ParsedWorkbook): ServerWorkbook => ({ label, workbook })

describe('estateWarnings', () => {
  it("returns a single source's warnings unchanged (no attribution prefix)", () => {
    const only = wb({ warnings: ['Sheet "Copies" reached the cap'] })
    expect(estateWarnings([srv('a', only)])).toEqual(['Sheet "Copies" reached the cap'])
  })

  it('adds the mixed-format umbrella when detail and summary servers are combined', () => {
    const detail = wb({
      sheets: { Copies: { name: 'Copies', headers: [], rows: [], capped: false } },
    })
    const summary = wb({
      sheets: {
        'System Configuration': {
          name: 'System Configuration',
          headers: [],
          rows: [],
          capped: false,
        },
        'VMs Count And Cap': { name: 'VMs Count And Cap', headers: [], rows: [], capped: false },
      },
    })
    const out = estateWarnings([srv('new', detail), srv('old', summary)])
    expect(out.some((w) => /mixes detail-format and summary-format/i.test(w))).toBe(true)
  })
})
