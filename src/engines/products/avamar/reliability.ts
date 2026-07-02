import type { RawWorkbook } from '../../../types/ppdm'
import {
  computeReliability,
  emptyRuntime,
  type QueueSample,
  type Reliability,
  type ReliabilityJob,
  type RuntimeBucketId,
} from '../../aggregation/reliability'
import { cellNum, cellStr } from '../../aggregation/rows'
import { serialToIso } from '../../parser/serialToIso'
import { BACKUP_OPS, EXCEPTION_STATUS, SUCCESS_STATUS } from './jobs'

const dayOf = (serial: number) => (serial > 0 ? serialToIso(serial).slice(0, 10) : '')

const RUNTIME_COLUMNS: [string, RuntimeBucketId][] = [
  ['<=15 min', 'le15m'],
  ['>15-30 mins', 'm15to30'],
  ['>30-60 mins', 'm30to60'],
  ['>1-2 hours', 'h1to2'],
  ['>2-4 hours', 'h2to4'],
  ['>4-8 hours', 'h4to8'],
  ['>8 hours', 'gt8h'],
]

/** Reliability inputs from Avamar DPN Summary (status/day/duration) and
 * Job List Detailed (queue delay), with the pre-aggregated Backup Runtime
 * Summary as histogram fallback. Pure. */
export function avamarReliability(wb: RawWorkbook): Reliability {
  const dpn = (wb.sheets['Avamar DPN Summary']?.rows ?? []).filter((r) =>
    BACKUP_OPS.has(cellStr(r, 'Operation')),
  )
  const jobs: ReliabilityJob[] = dpn.map((r) => {
    const status = cellStr(r, 'Status')
    return {
      host: cellStr(r, 'Host'),
      status:
        status === SUCCESS_STATUS
          ? 'success'
          : status === EXCEPTION_STATUS
            ? 'exception'
            : 'failed',
      day: dayOf(cellNum(r, 'Start Date')),
      durationHours: cellNum(r, 'Seconds') / 3600,
    }
  })

  const queue: QueueSample[] = (wb.sheets['Job List Detailed']?.rows ?? [])
    .filter((r) => cellNum(r, 'Time Queued (GMT)') > 0 && cellNum(r, 'Time Started (GMT)') > 0)
    .map((r) => ({
      host: cellStr(r, 'Host'),
      queuedHours: (cellNum(r, 'Time Started (GMT)') - cellNum(r, 'Time Queued (GMT)')) * 24,
    }))

  let fallbackRuntime: Record<RuntimeBucketId, number> | undefined
  const brs = wb.sheets['Backup Runtime Summary']?.rows[0]
  if (jobs.length === 0 && brs) {
    fallbackRuntime = emptyRuntime()
    for (const [col, id] of RUNTIME_COLUMNS) fallbackRuntime[id] = cellNum(brs, col)
  }

  return computeReliability(jobs, {
    queue: queue.length > 0 ? queue : undefined,
    fallbackRuntime,
    capped:
      (wb.sheets['Avamar DPN Summary']?.capped ?? false) ||
      (wb.sheets['Job List Detailed']?.capped ?? false),
  })
}
