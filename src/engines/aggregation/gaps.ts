import { type ParsedWorkbook, TOP_N_DEFAULT } from '../../types/ppdm'
import type { Gaps, UnprotectedAsset } from '../../types/reportView'
import { cellNum, cellStr } from './rows'
import { topN } from './topN'

/** Unprotected-asset gaps: count, total capacity, and the largest N by size. */
export function findGaps(wb: ParsedWorkbook, n: number = TOP_N_DEFAULT): Gaps {
  const rows = wb.sheets['Unprotected Assets']?.rows ?? []
  const assets: UnprotectedAsset[] = []
  let totalCapacityGb = 0
  for (const r of rows) {
    const asset: UnprotectedAsset = {
      name: cellStr(r, 'Name'),
      type: cellStr(r, 'Type'),
      sizeGb: cellNum(r, 'Size (GB)'),
    }
    assets.push(asset)
    totalCapacityGb += asset.sizeGb
  }
  return { count: assets.length, totalCapacityGb, top: topN(assets, n, (a) => a.sizeGb) }
}
