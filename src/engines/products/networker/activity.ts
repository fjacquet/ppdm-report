import type { Cell, RawWorkbook } from '../../../types/ppdm'
import {
  type Activity,
  type ActivityJob,
  computeActivity,
  osFamily,
} from '../../aggregation/activity'
import { cellNum, cellStr } from '../../aggregation/rows'
import { serialToIso } from '../../parser/serialToIso'

/** Presence-gated numeric cell: undefined when blank, the number (incl. 0) otherwise. */
function optNum(row: Record<string, Cell>, key: string): number | undefined {
  return cellStr(row, key) === '' ? undefined : cellNum(row, key)
}

/** Backup-carrying job types (save/vproxysave/backup action) — mirrors networkerReliability's filter. */
const isBackupJob = (jobType: string) => /save|backup/i.test(jobType)

/**
 * NetWorker activity/sizing merges two row sources into one `ActivityJob[]`, pure.
 *
 * `Backups` (per-backup detail) carries workload type + size + file count, but no
 * usable day here (`Backup Created` can be a string in this export; parsing it would
 * risk double-counting daily volume against the `Jobs` source below, so day is left
 * blank for these rows). These rows drive `byType` and `largest`.
 *
 * `Jobs` (filtered to backup-carrying job types) carries the `Start Time` serial but
 * no workload type. These rows drive `daily`.
 *
 * Both sets are passed to `computeActivity` as ONE combined array: byType/largest key
 * off `type` and skip blank-type rows (the Jobs rows), while daily keys off `day` and
 * skips blank-day rows (the Backups rows) — so the two sources compose without
 * double-counting, with no special-casing needed in the shared aggregator.
 *
 * Neither sheet carries throughput, so `slowest` stays empty.
 *
 * Neither sheet carries an OS column either, so `osSplit` — which `computeActivity`
 * would otherwise derive from job rows' `os` field — is overridden below from the
 * `Clients` sheet's `Client OS Type`, distinct by `Hostname`.
 */
export function networkerActivity(wb: RawWorkbook): Activity {
  const backupRows = wb.sheets.Backups?.rows ?? []
  const fromBackups: ActivityJob[] = backupRows.map((r) => ({
    host: cellStr(r, 'Client Name'),
    type: cellStr(r, 'Backup Type'),
    os: '',
    day: '',
    sizeGb: optNum(r, 'Backup Size (GB)'),
    files: optNum(r, 'Number of Files'),
    throughputMbSec: undefined,
    sentBytes: undefined,
    processedBytes: undefined,
  }))

  const jobRows = (wb.sheets.Jobs?.rows ?? []).filter((r) => isBackupJob(cellStr(r, 'Job Type')))
  const fromJobs: ActivityJob[] = jobRows.map((r) => {
    const start = cellNum(r, 'Start Time')
    return {
      host: cellStr(r, 'Client Name'),
      type: '',
      os: '',
      day: start > 0 ? serialToIso(start).slice(0, 10) : '',
      sizeGb: optNum(r, 'Size (GB)'),
      files: undefined,
      throughputMbSec: undefined,
      sentBytes: undefined,
      processedBytes: undefined,
    }
  })

  const computed = computeActivity([...fromBackups, ...fromJobs])

  const clientRows = wb.sheets.Clients?.rows ?? []
  let osSplit: Activity['osSplit']
  if (clientRows.length > 0) {
    const seen = new Set<string>()
    const counts = { Windows: 0, Linux: 0, Other: 0 }
    for (const r of clientRows) {
      const host = cellStr(r, 'Hostname')
      if (!host || seen.has(host)) continue
      seen.add(host)
      counts[osFamily(cellStr(r, 'Client OS Type'))] += 1
    }
    osSplit = { counts }
  }

  return { ...computed, osSplit }
}
