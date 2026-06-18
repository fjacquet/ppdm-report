import { describe, expect, it } from 'vitest'
import type { SheetData } from '../../types/ppdm'
import { classifyAgents, sheetIsInUse } from './detectInUse'

function sheet(name: string, rows: SheetData['rows']): SheetData {
  return { name, headers: Object.keys(rows[0] ?? {}), rows, capped: false }
}

describe('sheetIsInUse', () => {
  it('is false when every row is an N/A placeholder', () => {
    expect(sheetIsInUse(sheet('Oracle Databases', [{ 'Asset Name': 'N/A', Status: 'N/A' }]))).toBe(
      false,
    )
  })

  it('is false when there are no data rows', () => {
    expect(sheetIsInUse(sheet('NAS', []))).toBe(false)
  })

  it('is true when at least one row has a real value', () => {
    expect(sheetIsInUse(sheet('SQL Databases', [{ 'Asset Name': 'db1', Status: 'OK' }]))).toBe(true)
  })

  it('treats empty strings and nulls as placeholders', () => {
    expect(sheetIsInUse(sheet('NAS', [{ a: '', b: null }]))).toBe(false)
  })
})

describe('classifyAgents', () => {
  it('splits agent sheets into in-use and idle, ignoring non-agent sheets', () => {
    const sheets = [
      sheet('SQL Databases', [{ 'Asset Name': 'db1' }]),
      sheet('Oracle Databases', [{ 'Asset Name': 'N/A' }]),
      sheet('Copies', [{ 'Copy ID': 'c1' }]), // not an agent sheet
    ]
    expect(classifyAgents(sheets)).toEqual({
      inUse: ['SQL Databases'],
      idleAgents: ['Oracle Databases'],
    })
  })
})
