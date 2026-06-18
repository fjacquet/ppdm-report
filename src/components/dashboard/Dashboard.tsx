import { useTheme } from '../../hooks/useTheme'
import { useReportStore } from '../../store/reportStore'
import type { ReportView } from '../../types/reportView'
import { CapacitySection } from './CapacitySection'
import { CoverageSection } from './CoverageSection'
import { ExecutiveKpis } from './ExecutiveKpis'
import { GapsSection } from './GapsSection'
import { IdleAgentsSection } from './IdleAgentsSection'
import { JobsComplianceSection } from './JobsComplianceSection'
import { PoliciesSection } from './PoliciesSection'

interface DashboardProps {
  view: ReportView
}

/**
 * Assembles every dashboard section into one scrollable surface. `ExecutiveKpis`
 * always renders first; the remaining sections are ordered by the active flavor:
 *  - assessment: coverage-first (where are the gaps?)
 *  - ops: operations-first (are jobs running, is there capacity headroom?)
 */
export function Dashboard({ view }: DashboardProps) {
  const dark = useTheme().resolved === 'dark'
  const flavor = useReportStore((s) => s.flavor)

  const assessment = (
    <>
      <CoverageSection view={view} dark={dark} />
      <GapsSection view={view} />
      <IdleAgentsSection view={view} />
      <JobsComplianceSection view={view} />
      <CapacitySection view={view} />
      <PoliciesSection view={view} />
    </>
  )

  const ops = (
    <>
      <JobsComplianceSection view={view} />
      <CapacitySection view={view} />
      <CoverageSection view={view} dark={dark} />
      <GapsSection view={view} />
      <IdleAgentsSection view={view} />
      <PoliciesSection view={view} />
    </>
  )

  return (
    <div
      className="w-full space-y-8 bg-white p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <ExecutiveKpis view={view} />
      {flavor === 'assessment' ? assessment : ops}
    </div>
  )
}
