import type { ParsedWorkbook } from '../../types/ppdm'
import type { ReportView } from '../../types/reportView'
import { computeCapacity } from './capacity'
import { computeCompliance } from './compliance'
import { computeCoverage } from './coverage'
import { findGaps } from './gaps'
import { computeJobs } from './jobs'
import { summarizePolicies } from './policies'
import { allAvailable } from './provenance'

/** Single composition root: ParsedWorkbook → fully derived ReportView. Pure. */
export function buildReportView(wb: ParsedWorkbook): ReportView {
  const coverage = computeCoverage(wb)
  const totalAssets =
    coverage.overall.protected + coverage.overall.unprotected + coverage.overall.excluded
  return {
    meta: wb.meta,
    inUse: wb.inUse,
    idleAgents: wb.idleAgents,
    warnings: wb.warnings,
    coverage,
    gaps: findGaps(wb),
    jobs: computeJobs(wb),
    compliance: computeCompliance(wb),
    capacity: computeCapacity(wb),
    policies: summarizePolicies(wb),
    provenance: allAvailable(totalAssets),
  }
}
