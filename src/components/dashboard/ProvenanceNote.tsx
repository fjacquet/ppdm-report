import { useTranslation } from 'react-i18next'
import type { MetricProvenance } from '../../types/reportView'

const FONT = 'Arial, Helvetica, sans-serif'

/** A small caveat under a detail-only metric: unavailable, or partial coverage. Null when full. */
export function ProvenanceNote({ p, dark }: { p: MetricProvenance; dark: boolean }) {
  const { t } = useTranslation('dashboard')
  if (p.available && p.serversCovered >= p.serversTotal) return null

  const text = !p.available
    ? t('provenance.unavailable')
    : p.assetsCovered !== undefined && p.assetsTotal !== undefined
      ? t('provenance.partialAssets', {
          covered: p.serversCovered,
          total: p.serversTotal,
          assetsCovered: p.assetsCovered,
          assetsTotal: p.assetsTotal,
        })
      : t('provenance.partial', { covered: p.serversCovered, total: p.serversTotal })

  return (
    <p
      className={`mt-2 text-xs italic ${dark ? 'text-slate-400' : 'text-slate-500'}`}
      style={{ fontFamily: FONT }}
    >
      {text}
    </p>
  )
}
