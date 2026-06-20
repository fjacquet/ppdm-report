import { describe, expect, it } from 'vitest'
import {
  avamarWorkbookBuffer,
  detailWorkbookBuffer,
  networkerWorkbookBuffer,
} from '../../test-helpers/workbooks'
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
    // 'unknown' has no registered builder → skipped; document must not crash.
    const doc = buildEstateDocument([
      ppdmServer('a'),
      { label: 'x', product: 'unknown', workbook: normalizeWorkbook(detailWorkbookBuffer()) },
    ])
    expect(doc.products.map((p) => p.product)).toEqual(['ppdm'])
  })

  it('builds a NetWorker server into its own product section', () => {
    const doc = buildEstateDocument([
      { label: 'nw', product: 'networker', workbook: normalizeWorkbook(networkerWorkbookBuffer()) },
    ])
    expect(doc.products.map((p) => p.product)).toEqual(['networker'])
    expect(doc.products[0]?.estate.combined.coverage.overall.protected).toBe(2)
  })

  it('builds an Avamar server into its own product section', () => {
    const doc = buildEstateDocument([
      { label: 'ava', product: 'avamar', workbook: normalizeWorkbook(avamarWorkbookBuffer()) },
    ])
    expect(doc.products.map((p) => p.product)).toEqual(['avamar'])
    expect(doc.products[0]?.estate.combined.coverage.overall.protected).toBe(6)
  })
})
