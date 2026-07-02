import type { RawWorkbook } from '../../../types/ppdm'
import {
  computeReliability,
  type Reliability,
  type ReliabilityJob,
} from '../../aggregation/reliability'
import { cellNum, cellStr } from '../../aggregation/rows'
import { serialToIso } from '../../parser/serialToIso'

/** Backup-carrying job types (save/vproxysave/backup action); utility, task,
 * and workflow jobs are orchestration noise, not client backups. */
const isBackupJob = (jobType: string) => /save|backup/i.test(jobType)

/** Reliability inputs from the NetWorker Jobs sheet. No queued timestamp exists,
 * so queue delay stays unavailable. Pure. */
export function networkerReliability(wb: RawWorkbook): Reliability {
  const rows = (wb.sheets.Jobs?.rows ?? []).filter((r) => isBackupJob(cellStr(r, 'Job Type')))
  const jobs: ReliabilityJob[] = rows.map((r) => {
    const status = cellStr(r, 'Completion Status')
    const start = cellNum(r, 'Start Time')
    const end = cellNum(r, 'End Time')
    return {
      host: cellStr(r, 'Client Name'),
      status: status === 'Succeeded' ? 'success' : status === 'Failed' ? 'failed' : 'exception',
      day: start > 0 ? serialToIso(start).slice(0, 10) : '',
      durationHours: start > 0 && end >= start ? (end - start) * 24 : undefined,
    }
  })

  // Vendor-reported per-client success rate — corroboration only, never a computed input.
  const successRateByHost: Record<string, number> = {}
  for (const r of wb.sheets['Client Statistics']?.rows ?? []) {
    const host = cellStr(r, 'Hostname')
    if (host) successRateByHost[host] = cellNum(r, 'Success Rate')
  }

  return computeReliability(jobs, {
    successRateByHost,
    capped: wb.sheets.Jobs?.capped ?? false,
  })
}
