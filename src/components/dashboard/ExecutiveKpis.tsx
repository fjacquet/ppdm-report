import { useTranslation } from 'react-i18next'
import { immutableTone } from '../../engines/export/thresholds'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercent, formatGbOrUnknown } from '../../utils/format'
import { KpiCard } from '../KpiCard'

interface ExecutiveKpisProps {
  view: ReportView
}

export function ExecutiveKpis({ view }: ExecutiveKpisProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language

  const coverageValue = fmtPercent(view.coverage.overall.pct, locale)
  // Avamar/NetWorker exports never size never-backed-up clients: fall back to the
  // unprotected-asset count instead of a "size unknown" placeholder tile.
  const hasGapSizes =
    view.gaps.totalCapacityGb !== undefined ||
    view.gaps.top.items.some((a) => a.sizeGb !== undefined)
  const unprotectedValue = hasGapSizes
    ? formatGbOrUnknown(view.gaps.totalCapacityGb, locale, t('common:sizeUnknown'))
    : fmtInt(view.gaps.count, locale)
  const unprotectedLabel = hasGapSizes ? t('kpi.unprotected') : t('exposure.assets')
  const jobSuccessValue = fmtPercent(view.jobs.successPct, locale)
  const complianceAvailable = view.provenance.compliance.available

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <KpiCard value={coverageValue} label={t('kpi.coverage')} tone="ok" />
      <KpiCard value={unprotectedValue} label={unprotectedLabel} tone="warn" />
      <KpiCard value={jobSuccessValue} label={t('kpi.jobSuccess')} tone="ok" />
      {complianceAvailable ? (
        <KpiCard
          value={fmtPercent(view.compliance.immutablePct, locale)}
          label={t('kpi.immutable')}
          tone={immutableTone(view.compliance.immutablePct)}
        />
      ) : (
        <KpiCard value="—" label={t('kpi.immutable')} tone="muted" />
      )}
    </div>
  )
}
