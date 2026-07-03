import type { Cell, RawWorkbook } from '../../../types/ppdm'
import { type Activity, type ActivityJob, computeActivity } from '../../aggregation/activity'
import { cellNum, cellStr } from '../../aggregation/rows'
import { serialToIso } from '../../parser/serialToIso'

/** Presence-gated numeric cell: undefined when blank, the number (incl. 0) otherwise. */
function optNum(row: Record<string, Cell>, key: string): number | undefined {
  return cellStr(row, key) === '' ? undefined : cellNum(row, key)
}

/**
 * Avamar activity/sizing from Job List Detailed `Backup`-type rows. Pure.
 *
 * `sentBytes`/`processedBytes` stay undefined — Avamar per-type change rate is
 * deliberately not computed in v1: those byte columns live in Avamar DPN Summary,
 * which carries no policy type, and cross-sheet host-joins would be guesswork.
 * The estate-wide change rate already ships in `efficiency`.
 */
export function avamarActivity(wb: RawWorkbook): Activity {
  const rows = (wb.sheets['Job List Detailed']?.rows ?? []).filter(
    (r) => cellStr(r, 'Job Type') === 'Backup',
  )

  const jobs: ActivityJob[] = rows.map((r) => {
    const startDate = cellNum(r, 'Start Date')
    return {
      host: cellStr(r, 'Host'),
      type: cellStr(r, 'Policy Type'),
      os: cellStr(r, 'Operating System'),
      day: startDate > 0 ? serialToIso(startDate).slice(0, 10) : '',
      sizeGb: optNum(r, 'Capacity (GiB)'),
      files: optNum(r, '# Files'),
      throughputMbSec: optNum(r, 'MB/sec'),
      sentBytes: undefined,
      processedBytes: undefined,
    }
  })

  return computeActivity(jobs)
}
