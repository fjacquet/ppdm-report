import type { ParsedWorkbook } from '../../types/ppdm'
import type { Gaps, UnprotectedAsset } from '../../types/reportView'
import { cellNum, cellStr } from './rows'
import { topN } from './topN'

/** Unprotected-asset gaps: count, total capacity, and the largest N by size. */
export function findGaps(wb: ParsedWorkbook, n = 25): Gaps {
  const rows = wb.sheets['Unprotected Assets']?.rows ?? []
  const assets: UnprotectedAsset[] = rows.map((r) => ({
    name: cellStr(r, 'Name'),
    type: cellStr(r, 'Type'),
    sizeGb: cellNum(r, 'Size (GB)'),
  }))
  const totalCapacityGb = assets.reduce((sum, a) => sum + a.sizeGb, 0)
  return { count: assets.length, totalCapacityGb, top: topN(assets, n, (a) => a.sizeGb) }
}
