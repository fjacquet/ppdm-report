import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, ServerWorkbook, SheetData } from '../../types/ppdm'
import { buildReportView } from '../aggregation/reportView'
import { mergeWorkbooks } from './mergeWorkbooks'

function sheet(name: string, rows: Record<string, string | number>[], capped = false): SheetData {
  const headers = rows[0] ? Object.keys(rows[0]) : []
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

describe('mergeWorkbooks — edge cases', () => {
  it('throws on an empty server list', () => {
    expect(() => mergeWorkbooks([])).toThrow('requires at least one server')
  })
})

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
    expect(merged.sheets.Copies?.rows).toEqual([{ A: 1 }, { A: 2, B: 3 }])
    expect(merged.sheets.Copies?.headers).toEqual(['A', 'B'])
    expect(merged.sheets.Copies?.capped).toBe(true)
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

  it('meta.baseTen falls back to the first server when sources disagree', () => {
    const a = wb({ meta: { ...wb().meta, baseTen: false } })
    const b = wb({ meta: { ...wb().meta, baseTen: true } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.meta.baseTen).toBe(false)
  })
})

describe('mergeWorkbooks — warnings', () => {
  it('prefixes carried-over source warnings with the label', () => {
    const a = wb({ warnings: ['Sheet "Copies" reached the cap'] })
    const merged = mergeWorkbooks([srv('ppdm-a', a), srv('ppdm-b', wb())])
    expect(merged.warnings).toContain('[ppdm-a] Sheet "Copies" reached the cap')
  })

  it('warns on base-10 / base-2 unit mismatch', () => {
    const a = wb({ meta: { ...wb().meta, baseTen: true } })
    const b = wb({ meta: { ...wb().meta, baseTen: false } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.warnings.some((w) => /base-10 and base-2/.test(w))).toBe(true)
  })

  it('warns when two files report the same appliance host', () => {
    const sys = {
      'System Information': sheet('System Information', [{ 'Host Name': 'ppdm.who.int' }]),
    }
    const merged = mergeWorkbooks([
      srv('first', wb({ sheets: { ...sys } })),
      srv('second', wb({ sheets: { ...sys } })),
    ])
    expect(merged.warnings.some((w) => /double-counted/.test(w))).toBe(true)
  })

  it('warns when a sheet is capped in 2+ sources (blended window)', () => {
    const a = wb({ sheets: { Copies: sheet('Copies', [{ A: 1 }], true) } })
    const b = wb({ sheets: { Copies: sheet('Copies', [{ A: 2 }], true) } })
    const merged = mergeWorkbooks([srv('a', a), srv('b', b)])
    expect(merged.warnings.some((w) => /blend independent windows/.test(w))).toBe(true)
  })
})
