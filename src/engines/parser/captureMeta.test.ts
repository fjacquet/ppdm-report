import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
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
    expect(meta).toEqual({ projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: false })
  })
})
