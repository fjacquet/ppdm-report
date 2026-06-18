import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { Cell } from '../../types/ppdm'
import { normalizeWorkbook } from './normalizeWorkbook'

function makeWorkbook(sheets: Record<string, Cell[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('normalizeWorkbook', () => {
  it('produces meta, sheets, in-use/idle classification, and cap warnings', () => {
    const cappedRows: Cell[][] = [['Copy ID']]
    for (let i = 0; i < 10_000; i++) cappedRows.push([`c${i}`])

    const result = normalizeWorkbook(
      makeWorkbook({
        Details: [
          ['Project Name', 'WHO'],
          ['Collector Build Version', '27.2.5.278'],
        ],
        'SQL Databases': [
          ['Asset Name', 'Protection Status'],
          ['db1', 'PROTECTED'],
        ],
        'Oracle Databases': [
          ['Asset Name', 'Protection Status'],
          ['N/A', 'N/A'],
        ],
        Copies: cappedRows,
      }),
    )

    expect(result.meta.customer).toBe('WHO')
    expect(result.inUse).toContain('SQL Databases')
    expect(result.idleAgents).toContain('Oracle Databases')
    expect(result.sheets['SQL Databases']?.rows).toHaveLength(1)
    expect(result.warnings.some((w) => w.includes('Copies'))).toBe(true)
  })
})
