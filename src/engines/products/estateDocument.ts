import type { ProductId, ServerWorkbook } from '../../types/ppdm'
import type { EstateDocument, EstateView, ProductEstate } from '../../types/reportView'
import { mergeViews } from '../aggregation/mergeViews'
import { appVersion } from '../parser/deriveLabel'
import { estateWarnings } from '../parser/estateWarnings'
import { getViewBuilder } from './index'

/** Group loaded servers by product and build one EstateView section per product. Pure. */
export function buildEstateDocument(servers: ServerWorkbook[]): EstateDocument {
  const order: ProductId[] = []
  const groups = new Map<ProductId, ServerWorkbook[]>()
  for (const s of servers) {
    const existing = groups.get(s.product)
    if (existing) {
      existing.push(s)
    } else {
      groups.set(s.product, [s])
      order.push(s.product)
    }
  }

  const products: ProductEstate[] = []
  for (const product of order) {
    const group = groups.get(product) ?? []
    const build = getViewBuilder(product)
    if (!build) continue // unsupported products never reach the store; defensively skipped
    const perServer = group.map((s) => ({
      label: s.label,
      version: appVersion(s.workbook),
      view: build(s.workbook),
    }))
    const estate: EstateView = {
      combined: { ...mergeViews(perServer.map((p) => p.view)), warnings: estateWarnings(group) },
      perServer,
      multiSource: group.length > 1,
    }
    products.push({ product, estate })
  }

  return { products, multiProduct: products.length > 1 }
}
