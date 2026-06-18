import { SECTION_ORDER, type SectionId } from '../../engines/export/sectionOrder'
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

  function renderSection(id: SectionId) {
    switch (id) {
      case 'coverage':
        return <CoverageSection key={id} view={view} dark={dark} />
      case 'gaps':
        return <GapsSection key={id} view={view} dark={dark} />
      case 'idle':
        return <IdleAgentsSection key={id} view={view} />
      case 'jobs':
        return <JobsComplianceSection key={id} view={view} />
      case 'compliance':
        return null
      case 'capacity':
        return <CapacitySection key={id} view={view} />
      case 'policies':
        return <PoliciesSection key={id} view={view} />
    }
  }

  return (
    <div
      className="w-full space-y-8 bg-white p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <ExecutiveKpis view={view} />
      {SECTION_ORDER[flavor].map((id) => renderSection(id))}
    </div>
  )
}
