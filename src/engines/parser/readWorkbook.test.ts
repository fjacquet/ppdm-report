import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import type { Cell } from '../../types/ppdm'
import { parseXlsx } from './readWorkbook'

function makeWorkbook(sheets: Record<string, Cell[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseXlsx', () => {
  it('parses headers and keyed rows', () => {
    const buf = makeWorkbook({
      SQL: [
        ['Asset Name', 'Protection Status'],
        ['db1', 'PROTECTED'],
        ['db2', 'UNPROTECTED'],
      ],
    })
    const sheets = parseXlsx(buf)
    const sql = sheets.find((s) => s.name === 'SQL')
    expect(sql).toBeDefined()
    expect(sql?.headers).toEqual(['Asset Name', 'Protection Status'])
    expect(sql?.rows).toEqual([
      { 'Asset Name': 'db1', 'Protection Status': 'PROTECTED' },
      { 'Asset Name': 'db2', 'Protection Status': 'UNPROTECTED' },
    ])
    expect(sql?.capped).toBe(false)
  })

  it('flags a sheet at the row cap as capped', () => {
    const rows: Cell[][] = [['Id']]
    for (let i = 0; i < 10_000; i++) rows.push([i])
    const sheets = parseXlsx(makeWorkbook({ Copies: rows }))
    expect(sheets.find((s) => s.name === 'Copies')?.capped).toBe(true)
  })
})
