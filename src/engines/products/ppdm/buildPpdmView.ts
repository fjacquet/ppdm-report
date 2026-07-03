import type { RawWorkbook } from '../../../types/ppdm'
import type { ReportView } from '../../../types/reportView'
import { emptyActivity } from '../../aggregation/activity'
import { computeCapacity } from '../../aggregation/capacity'
import { emptyCapacityTrend } from '../../aggregation/capacityTrend'
import { computeCompliance } from '../../aggregation/compliance'
import { computeCoverage } from '../../aggregation/coverage'
import { emptyEfficiency } from '../../aggregation/efficiency'
import { computeFrontEnd } from '../../aggregation/frontEnd'
import { findGaps } from '../../aggregation/gaps'
import { emptyHygiene } from '../../aggregation/hygiene'
import { computeJobs } from '../../aggregation/jobs'
import { emptyOpsInsights } from '../../aggregation/opsInsights'
import { summarizePolicies } from '../../aggregation/policies'
import { allAvailable } from '../../aggregation/provenance'
import { emptyReliability } from '../../aggregation/reliability'
import { summaryView } from '../../aggregation/summaryView'
import { detectFormat } from '../../parser/detectFormat'
import { classifyAgents } from '../../parser/detectInUse'

/** PPDM composition root: RawWorkbook → fully derived ReportView. Pure. */
export function buildPpdmView(wb: RawWorkbook): ReportView {
  if (detectFormat(wb) === 'summary') return summaryView(wb)
  const { inUse, idleAgents } = classifyAgents(Object.values(wb.sheets))
  const coverage = computeCoverage(wb)
  const totalAssets =
    coverage.overall.protected + coverage.overall.unprotected + coverage.overall.excluded
  return {
    meta: wb.meta,
    inUse,
    idleAgents,
    warnings: wb.warnings,
    coverage,
    gaps: findGaps(wb),
    jobs: computeJobs(wb),
    compliance: computeCompliance(wb),
    capacity: computeCapacity(wb),
    policies: summarizePolicies(wb),
    frontEnd: computeFrontEnd(wb, inUse),
    opsInsights: emptyOpsInsights(),
    reliability: emptyReliability(),
    efficiency: emptyEfficiency(),
    capacityTrend: emptyCapacityTrend(),
    hygiene: emptyHygiene(),
    activity: emptyActivity(),
    provenance: allAvailable(totalAssets),
  }
}
