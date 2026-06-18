import { FLAG_THRESHOLD_PCT, type ParsedWorkbook } from '../../types/ppdm'
import type { Capacity, StorageTarget } from '../../types/reportView'
import { cellNum, cellStr } from './rows'

/** Storage-target utilization with capacity-risk flags, plus Data Domain mtree count. */
export function computeCapacity(
  wb: ParsedWorkbook,
  flagThresholdPct: number = FLAG_THRESHOLD_PCT,
): Capacity {
  const rows = wb.sheets['Storage Targets']?.rows ?? []
  const targets: StorageTarget[] = rows.map((r) => {
    const utilizationPct = cellNum(r, 'Utilization (%)')
    const hasUtil = cellStr(r, 'Utilization (%)') !== ''
    return {
      name: cellStr(r, 'Name'),
      type: cellStr(r, 'Type'),
      utilizationPct,
      flagged: hasUtil && utilizationPct >= flagThresholdPct,
    }
  })
  return {
    targets,
    flagged: targets.filter((t) => t.flagged),
    mtreeCount: wb.sheets['Data Domain Mtrees']?.rows.length ?? 0,
  }
}
