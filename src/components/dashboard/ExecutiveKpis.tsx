import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtPercent, formatBytes } from '../../utils/format'
import { KpiCard } from '../KpiCard'

interface ExecutiveKpisProps {
  view: ReportView
}

export function ExecutiveKpis({ view }: ExecutiveKpisProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language

  const coverageValue = fmtPercent(view.coverage.overall.pct, locale)
  const unprotectedValue = formatBytes(view.gaps.totalCapacityGb * 1e9, locale)
  const jobSuccessValue = fmtPercent(view.jobs.successPct, locale)
  const immutableValue = fmtPercent(view.compliance.immutablePct, locale)

  const immutableTone = view.compliance.immutablePct === 0 ? 'bad' : 'ok'

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <KpiCard value={coverageValue} label={t('kpi.coverage')} tone="ok" />
      <KpiCard value={unprotectedValue} label={t('kpi.unprotected')} tone="warn" />
      <KpiCard value={jobSuccessValue} label={t('kpi.jobSuccess')} tone="ok" />
      <KpiCard value={immutableValue} label={t('kpi.immutable')} tone={immutableTone} />
    </div>
  )
}
