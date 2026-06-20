import type { ProductId, RawWorkbook } from '../../types/ppdm'
import type { ReportView } from '../../types/reportView'
import { buildPpdmView } from './ppdm/buildPpdmView'

export type ViewBuilder = (wb: RawWorkbook) => ReportView

const BUILDERS: Partial<Record<ProductId, ViewBuilder>> = {
  ppdm: buildPpdmView,
}

/** The view-builder for a product, or undefined when unsupported. */
export function getViewBuilder(product: ProductId): ViewBuilder | undefined {
  return BUILDERS[product]
}

/** True when a product has a registered adapter (phase 1: PPDM only). */
export function isSupportedProduct(product: ProductId): boolean {
  return getViewBuilder(product) !== undefined
}
