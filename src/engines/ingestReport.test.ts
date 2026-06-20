import { describe, expect, it } from 'vitest'
import { summaryWorkbookBuffer } from '../test-helpers/workbooks'
import { ingestReport } from './ingestReport'

describe('ingestReport', () => {
  it('parses a PPDM summary workbook into an EstateDocument with one product', () => {
    const doc = ingestReport([{ name: 'acme_ppdm.xlsx', bytes: summaryWorkbookBuffer() }])
    expect(doc.products.length).toBeGreaterThan(0)
    expect(doc.products[0]?.estate.combined).toBeTruthy()
  })
})
