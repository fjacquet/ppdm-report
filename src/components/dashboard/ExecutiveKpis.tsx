import { useTranslation } from 'react-i18next'
import { immutableTone } from '../../engines/export/thresholds'
import type { ReportView } from '../../types/reportView'
import { fmtPercent, formatGbOrUnknown } from '../../utils/format'
import { KpiCard } from '../KpiCard'

interface ExecutiveKpisProps {
  view: ReportView
}

export function ExecutiveKpis({ view }: ExecutiveKpisProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language

  const coverageValue = fmtPercent(view.coverage.overall.pct, locale)
  const unprotectedValue = formatGbOrUnknown(
    view.gaps.totalCapacityGb,
    locale,
    t('common:sizeUnknown'),
  )
  const jobSuccessValue = fmtPercent(view.jobs.successPct, locale)
  const complianceAvailable = view.provenance.compliance.available

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <KpiCard value={coverageValue} label={t('kpi.coverage')} tone="ok" />
      <KpiCard value={unprotectedValue} label={t('kpi.unprotected')} tone="warn" />
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
