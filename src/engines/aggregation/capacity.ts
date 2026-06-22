import { FLAG_THRESHOLD_PCT, type RawWorkbook } from '../../types/ppdm'
import type { Capacity, StorageTarget } from '../../types/reportView'
import { cellNum, cellStr } from './rows'

/** Storage-target utilization with capacity-risk flags, plus Data Domain mtree count. */
export function computeCapacity(
  wb: RawWorkbook,
  flagThresholdPct: number = FLAG_THRESHOLD_PCT,
): Capacity {
  const rows = wb.sheets['Storage Targets']?.rows ?? []
  const targets: StorageTarget[] = rows.map((r) => {
    const utilizationPct = cellNum(r, 'Utilization (%)')
    const hasUtil = cellStr(r, 'Utilization (%)') !== ''
    const hasUsed = cellStr(r, 'Total Used (GB)') !== ''
    const hasTotal = cellStr(r, 'Total Size (GB)') !== ''
    const usedGb = hasUsed ? cellNum(r, 'Total Used (GB)') : undefined
    const totalGb = hasTotal ? cellNum(r, 'Total Size (GB)') : undefined
    const freeGb = usedGb !== undefined && totalGb !== undefined ? totalGb - usedGb : undefined
    return {
      name: cellStr(r, 'Name'),
      type: cellStr(r, 'Type'),
      utilizationPct,
      flagged: hasUtil && utilizationPct >= flagThresholdPct,
      usedGb,
      totalGb,
      freeGb,
    }
  })
  return {
    targets,
    flagged: targets.filter((t) => t.flagged),
    mtreeCount: wb.sheets['Data Domain Mtrees']?.rows.length ?? 0,
  }
}
