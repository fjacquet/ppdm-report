import type { RawWorkbook } from '../../../types/ppdm'
import type { ReportView } from '../../../types/reportView'
import { computeCapacity } from '../../aggregation/capacity'
import { computeCompliance } from '../../aggregation/compliance'
import { computeCoverage } from '../../aggregation/coverage'
import { emptyFrontEnd } from '../../aggregation/frontEnd'
import { findGaps } from '../../aggregation/gaps'
import { computeJobs } from '../../aggregation/jobs'
import { summarizePolicies } from '../../aggregation/policies'
import { allAvailable } from '../../aggregation/provenance'
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
    frontEnd: emptyFrontEnd(),
    provenance: allAvailable(totalAssets),
  }
}
