import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detailWorkbookBuffer, summaryWorkbookBuffer } from '../../test-helpers/workbooks'
import { detectFormat } from './detectFormat'
import { normalizeWorkbook } from './normalizeWorkbook'

function load(path: string) {
  return normalizeWorkbook(new Uint8Array(readFileSync(path)).buffer)
}

describe('detectFormat', () => {
  it('classifies a synthetic summary workbook as summary', () => {
    expect(detectFormat(normalizeWorkbook(summaryWorkbookBuffer()))).toBe('summary')
  })

  it('classifies a synthetic per-asset (detail) workbook as detail', () => {
    expect(detectFormat(normalizeWorkbook(detailWorkbookBuffer()))).toBe('detail')
  })

  it('treats an unrecognized workbook as detail', () => {
    const wb = { meta: {} as never, sheets: {}, inUse: [], idleAgents: [], warnings: [] }
    expect(detectFormat(wb)).toBe('detail')
  })

  // Local-only regression against the real CHUV exports; skipped in CI where ref/ is absent.
  it.skipIf(!existsSync('ref/chuv-a1n01136i.xlsx'))(
    'classifies older summary exports as summary',
    () => {
      expect(detectFormat(load('ref/chuv-a1n01136i.xlsx'))).toBe('summary')
    },
  )

  it.skipIf(!existsSync('ref/PPDM.xlsx'))(
    'classifies current per-asset exports as detail',
    () => {
      expect(detectFormat(load('ref/PPDM.xlsx'))).toBe('detail')
    },
    15_000,
  ) // PPDM.xlsx is ~2.4 MB; allow extra time when running under full parallel load
})
