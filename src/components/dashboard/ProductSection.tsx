import { useTranslation } from 'react-i18next'
import type { ProductId } from '../../types/ppdm'
import type { EstateView } from '../../types/reportView'
import { Dashboard } from './Dashboard'

const PRODUCT_LABEL: Record<ProductId, string> = {
  ppdm: 'PowerProtect Data Manager',
  avamar: 'Avamar',
  networker: 'NetWorker',
  unknown: 'Unknown',
}

/** One product's estate, headed by a product badge, then the full dashboard. */
export function ProductSection({ product, estate }: { product: ProductId; estate: EstateView }) {
  const { t } = useTranslation('dashboard')
  return (
    <section style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {t('product.badge')}: {PRODUCT_LABEL[product]}
      </h2>
      <Dashboard view={estate.combined} perServer={estate.perServer} />
    </section>
  )
}
