import type { RawWorkbook } from '../../../types/ppdm'
import { cellNum, cellStr } from '../../aggregation/rows'

/** Policy types that are maintenance/no-op — never surfaced as workloads. */
const NON_WORKLOAD = new Set(['GC', 'No Plug-in'])

/** In-use workload types from Job List Detailed `Policy Type` (backup jobs only);
 * falls back to Backup Plugins (`Plugin Name` where `Count > 0`). Pure. */
export function avamarWorkloads(wb: RawWorkbook): string[] {
  const jobs = wb.sheets['Job List Detailed']?.rows ?? []
  if (jobs.length > 0) {
    const seen = new Set<string>()
    for (const r of jobs) {
      if (cellStr(r, 'Job Type') !== 'Backup') continue
      const pt = cellStr(r, 'Policy Type')
      if (pt !== '' && !NON_WORKLOAD.has(pt)) seen.add(pt)
    }
    return [...seen]
  }
  return (wb.sheets['Backup Plugins']?.rows ?? [])
    .filter((r) => cellNum(r, 'Count') > 0)
    .map((r) => cellStr(r, 'Plugin Name'))
    .filter((n) => n !== '')
}
