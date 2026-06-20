import { describe, expect, it } from 'vitest'
import { detailWorkbookBuffer } from '../../test-helpers/workbooks'
import type { ServerWorkbook } from '../../types/ppdm'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { buildEstateDocument } from './estateDocument'

const ppdmServer = (label: string): ServerWorkbook => ({
  label,
  product: 'ppdm',
  workbook: normalizeWorkbook(detailWorkbookBuffer()),
})

describe('buildEstateDocument', () => {
  it('groups a single PPDM server into one product section', () => {
    const doc = buildEstateDocument([ppdmServer('a')])
    expect(doc.multiProduct).toBe(false)
    expect(doc.products).toHaveLength(1)
    expect(doc.products[0]?.product).toBe('ppdm')
    expect(doc.products[0]?.estate.multiSource).toBe(false)
    expect(doc.products[0]?.estate.perServer).toHaveLength(1)
  })

  it('merges multiple servers of the same product into one section', () => {
    const doc = buildEstateDocument([ppdmServer('a'), ppdmServer('b')])
    expect(doc.multiProduct).toBe(false)
    expect(doc.products).toHaveLength(1)
    expect(doc.products[0]?.estate.multiSource).toBe(true)
    expect(doc.products[0]?.estate.perServer.map((p) => p.label)).toEqual(['a', 'b'])
  })

  it('skips a recognized-but-unbuilt product without crashing the document', () => {
    // Simulate a second product by hand-tagging (no avamar builder yet → skipped),
    // so a recognized-but-unbuilt product does not crash the document.
    const doc = buildEstateDocument([
      ppdmServer('a'),
      { label: 'x', product: 'avamar', workbook: normalizeWorkbook(detailWorkbookBuffer()) },
    ])
    expect(doc.products.map((p) => p.product)).toEqual(['ppdm'])
  })
})
