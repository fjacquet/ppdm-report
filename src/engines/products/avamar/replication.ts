import type { RawWorkbook } from '../../../types/ppdm'
import type { Compliance } from '../../../types/reportView'
import { cellNum, cellStr } from '../../aggregation/rows'

const SUCCESS_STATUS = 'Activity completed successfully.'

/** Replication resilience from Avamar's `Replication (Completion Status)` sheet.
 * Populates replicatedPct only; app-consistency + immutability are N/A → 0%
 * (NetWorker precedent). Pure. */
export function avamarReplication(wb: RawWorkbook): Compliance {
  const rows = wb.sheets['Replication (Completion Status)']?.rows ?? []
  let replicated = 0
  let total = 0
  for (const r of rows) {
    const n = cellNum(r, 'Total')
    total += n
    if (cellStr(r, 'Status') === SUCCESS_STATUS) replicated += n
  }
  return {
    appConsistentPct: 0,
    immutablePct: 0,
    replicatedPct: total > 0 ? replicated / total : 0,
    appConsistentCount: 0,
    immutableCount: 0,
    replicatedCount: replicated,
    backupLevelMix: {},
    windowSize: total,
    capped: false,
  }
}
