import type { RawWorkbook } from '../../../types/ppdm'
import type { Jobs } from '../../../types/reportView'
import { cellNum, cellStr } from '../../aggregation/rows'

const SUCCESS_STATUS = 'Activity completed successfully.'
const EXCEPTION_STATUS = 'Activity completed with exceptions.'
const BACKUP_OPS = new Set(['On-Demand Backup', 'Scheduled Backup'])

/** Jobs from the per-backup Avamar DPN Summary (detail); falls back to the
 * pre-aggregated Backup Completion Summary. `capped` is always false — Avamar
 * exports are not subject to the PPDM 10k row cap. Pure. */
export function avamarJobs(wb: RawWorkbook): Jobs {
  const detail = (wb.sheets['Avamar DPN Summary']?.rows ?? []).filter((r) =>
    BACKUP_OPS.has(cellStr(r, 'Operation')),
  )
  if (detail.length > 0) {
    let success = 0
    let exception = 0
    let failed = 0
    for (const r of detail) {
      const status = cellStr(r, 'Status')
      if (status === SUCCESS_STATUS) success++
      else if (status === EXCEPTION_STATUS) exception++
      else failed++
    }
    const total = detail.length
    return {
      counts: { SUCCESS: success, EXCEPTION: exception, FAILED: failed },
      total,
      successPct: total > 0 ? success / total : 0,
      capped: false,
      windowSize: total,
    }
  }

  const bcs = wb.sheets['Backup Completion Summary']?.rows[0]
  const total = bcs ? cellNum(bcs, 'Total') : 0
  const success = bcs ? cellNum(bcs, 'Successful') : 0
  return {
    counts: {
      SUCCESS: success,
      EXCEPTION: bcs ? cellNum(bcs, 'Exception') : 0,
      FAILED: bcs ? cellNum(bcs, 'Failed') : 0,
    },
    total,
    successPct: total > 0 ? success / total : 0,
    capped: false,
    windowSize: total,
  }
}
