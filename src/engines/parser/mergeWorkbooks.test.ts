import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, ServerWorkbook, SheetData } from '../../types/ppdm'
import { buildReportView } from '../aggregation/reportView'
import { mergeWorkbooks } from './mergeWorkbooks'

function sheet(name: string, rows: Record<string, string | number>[], capped = false): SheetData {
  const headers = rows.length ? Object.keys(rows[0]) : []
  return { name, headers, rows, capped }
}

function wb(over: Partial<ParsedWorkbook> = {}): ParsedWorkbook {
  return {
    meta: {
      projectId: 'p1',
      customer: 'ACME',
      collectorBuild: 'b1',
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

describe('mergeWorkbooks — single source', () => {
  it('is an identity for one server (view is unchanged)', () => {
    const only = wb({
      sheets: {
        'Storage Targets': sheet('Storage Targets', [{ Name: 'dd1', 'Utilization (%)': 80 }]),
      },
    })
    const merged = mergeWorkbooks([srv('a', only)])
    expect(buildReportView(merged)).toEqual(buildReportView(only))
  })
})

describe('mergeWorkbooks — multiple sources', () => {
  it('concatenates rows, unions headers, ORs the capped flag', () => {
    const a = wb({ sheets: { Copies: sheet('Copies', [{ A: 1 }], true) } })
    const b = wb({ sheets: { Copies: sheet('Copies', [{ A: 2, B: 3 }], false) } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.sheets.Copies.rows).toEqual([{ A: 1 }, { A: 2, B: 3 }])
    expect(merged.sheets.Copies.headers).toEqual(['A', 'B'])
    expect(merged.sheets.Copies.capped).toBe(true)
  })

  it('unions sheet names across sources', () => {
    const a = wb({ sheets: { Policies: sheet('Policies', [{ Name: 'x' }]) } })
    const b = wb({ sheets: { 'Storage Targets': sheet('Storage Targets', [{ Name: 'dd' }]) } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(Object.keys(merged.sheets).sort()).toEqual(['Policies', 'Storage Targets'])
  })

  it('re-derives inUse: idle on A + in-use on B → in-use', () => {
    const idle = sheet('Oracle Databases', [{ Name: 'N/A' }])
    const live = sheet('Oracle Databases', [{ Name: 'realdb' }])
    const merged = mergeWorkbooks([
      srv('a', wb({ sheets: { 'Oracle Databases': idle } })),
      srv('b', wb({ sheets: { 'Oracle Databases': live } })),
    ])
    expect(merged.inUse).toContain('Oracle Databases')
    expect(merged.idleAgents).not.toContain('Oracle Databases')
  })

  it('folds meta: first customer, latest capturedAt, uniform baseTen', () => {
    const a = wb({
      meta: {
        projectId: 'p1',
        customer: 'ACME',
        collectorBuild: 'b1',
        capturedAt: '2026-01-01',
        baseTen: true,
      },
    })
    const b = wb({
      meta: {
        projectId: 'p2',
        customer: 'ACME',
        collectorBuild: 'b2',
        capturedAt: '2026-03-09',
        baseTen: true,
      },
    })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.meta.customer).toBe('ACME')
    expect(merged.meta.capturedAt).toBe('2026-03-09')
    expect(merged.meta.baseTen).toBe(true)
  })
})
