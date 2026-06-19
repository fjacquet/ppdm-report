import { describe, expect, it } from 'vitest'
import { summaryWorkbookBuffer } from '../../test-helpers/workbooks'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { allAvailable } from './provenance'
import { buildReportView } from './reportView'

function sheet(name: string, rows: Array<Record<string, string>>): SheetData {
  return { name, headers: Object.keys(rows[0] ?? {}), rows, capped: false }
}

describe('buildReportView', () => {
  it('composes every engine result and passes through workbook metadata', () => {
    const wb: ParsedWorkbook = {
      meta: {
        projectId: '1',
        customer: 'WHO',
        collectorBuild: '27.2.5.278',
        capturedAt: '2026-06-15T00:00:00.000Z',
        baseTen: true,
      },
      sheets: {
        'SQL Databases': sheet('SQL Databases', [
          { 'Protection Status': 'PROTECTED' },
          { 'Protection Status': 'UNPROTECTED' },
        ]),
        'Unprotected Assets': sheet('Unprotected Assets', [
          { Name: 'x', Type: 'VM', 'Size (GB)': '10' },
        ]),
        Policies: sheet('Policies', [
          { Name: 'p', Purpose: 'CENTRALIZED', 'Number of Assets': '1' },
        ]),
      },
      inUse: ['SQL Databases'],
      idleAgents: ['Oracle Databases'],
      warnings: ['capped: Copies'],
    }
    const view = buildReportView(wb)
    expect(view.meta.customer).toBe('WHO')
    expect(view.inUse).toEqual(['SQL Databases'])
    expect(view.idleAgents).toEqual(['Oracle Databases'])
    expect(view.warnings).toEqual(['capped: Copies'])
    expect(view.coverage.overall.protected).toBe(1)
    expect(view.gaps.count).toBe(1)
    expect(view.policies.count).toBe(1)
    expect(view.jobs.total).toBe(0) // no job sheet → safe zero
    expect(view.compliance.windowSize).toBe(0)
    expect(view.capacity.mtreeCount).toBe(0)
    expect(view.provenance).toEqual(allAvailable(2))
  })

  it('dispatches summary-format workbooks to the summary extractor', () => {
    const view = buildReportView(normalizeWorkbook(summaryWorkbookBuffer()))
    expect(view.coverage.overall.protected).toBe(80)
    expect(view.provenance.compliance.available).toBe(false)
  })
})
