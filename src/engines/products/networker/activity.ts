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

/**
 * NetWorker activity/sizing is single-sourced from `Backups` (per-backup detail), pure.
 *
 * Each row carries workload type, size, file count, and `Backup Created` — an Excel
 * serial (e.g. 46174.33) that converts directly via `serialToIso`. These rows drive
 * `byType`, `largest`, and `daily` all at once, so a backup can never rank twice in
 * `largest` by also surfacing through a second sheet. `daily` here means "backups per
 * day" (a count + summed size per calendar day), not distinct job starts.
 *
 * `Backups` carries no throughput column, so `slowest` stays empty.
 *
 * `Backups` carries no OS column either, so `osSplit` — which `computeActivity` would
 * otherwise derive from job rows' `os` field — is overridden below from the `Clients`
 * sheet's `Client OS Type`, distinct by `Hostname`.
 */
export function networkerActivity(wb: RawWorkbook): Activity {
  const backupRows = wb.sheets.Backups?.rows ?? []
  const fromBackups: ActivityJob[] = backupRows.map((r) => {
    const created = cellNum(r, 'Backup Created')
    return {
      host: cellStr(r, 'Client Name'),
      type: cellStr(r, 'Backup Type'),
      os: '',
      day: created > 0 ? serialToIso(created).slice(0, 10) : '',
      sizeGb: optNum(r, 'Backup Size (GB)'),
      files: optNum(r, 'Number of Files'),
      throughputMbSec: undefined,
      sentBytes: undefined,
      processedBytes: undefined,
    }
  })

  const computed = computeActivity(fromBackups)

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
