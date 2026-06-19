import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectFormat } from './detectFormat'
import { normalizeWorkbook } from './normalizeWorkbook'

function load(path: string) {
  return normalizeWorkbook(new Uint8Array(readFileSync(path)).buffer)
}

describe('detectFormat', () => {
  it('classifies older summary exports as summary', () => {
    expect(detectFormat(load('ref/chuv-a1n01136i.xlsx'))).toBe('summary')
  })

  it('classifies current per-asset exports as detail', () => {
    expect(detectFormat(load('ref/PPDM.xlsx'))).toBe('detail')
  })

  it('treats an unrecognized workbook as detail', () => {
    const wb = { meta: {} as never, sheets: {}, inUse: [], idleAgents: [], warnings: [] }
    expect(detectFormat(wb)).toBe('detail')
  })
})
