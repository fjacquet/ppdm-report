import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { Cell } from '../../types/ppdm'
import { captureMeta } from './captureMeta'

function wbWithDetails(rows: Cell[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Details')
  return wb
}

describe('captureMeta', () => {
  it('reads project, customer, collector build, date and base-10 flag', () => {
    const meta = captureMeta(
      wbWithDetails([
        ['Project ID', '3359956'],
        ['Project Name', 'WHO'],
        ['Date', 46188.59040939815],
        ['Collector Build Version', '27.2.5.278'],
        ['Disclaimer', 'All measurements ... using Base 10 units of Measurement.'],
      ]),
    )
    expect(meta.projectId).toBe('3359956')
    expect(meta.customer).toBe('WHO')
    expect(meta.collectorBuild).toBe('27.2.5.278')
    expect(meta.capturedAt.slice(0, 7)).toBe('2026-06')
    expect(meta.baseTen).toBe(true)
  })

  it('returns safe defaults when Details is missing', () => {
    const meta = captureMeta(XLSX.utils.book_new())
    expect(meta).toEqual({
      projectId: '',
      customer: '',
      collectorBuild: '',
      capturedAt: '',
      baseTen: false,
    })
  })
})

describe('captureMeta — summary tolerances', () => {
  it('parses DD/MM/YYYY HH:mm:ss dates as UTC ISO', () => {
    const meta = captureMeta(
      wbWithDetails([
        ['Project Name', 'chuv'],
        ['Date', '18/02/2025 03:54:24'],
      ]),
    )
    expect(meta.capturedAt).toBe('2025-02-18T03:54:24.000Z')
  })

  it('reads base-10 from any Disclaimer row, not just the last', () => {
    const meta = captureMeta(
      wbWithDetails([
        ['Project Name', 'chuv'],
        ['Disclaimer', 'All measurements ... reported using Base 10 units of Measurement.'],
        ['Disclaimer', 'Some Policy details would be missing for older PPDM versions.'],
      ]),
    )
    expect(meta.baseTen).toBe(true)
  })

  it('leaves unparseable dates as empty string', () => {
    const meta = captureMeta(wbWithDetails([['Date', 'not a date']]))
    expect(meta.capturedAt).toBe('')
  })
})
