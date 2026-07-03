import { type RawWorkbook, TOP_N_DEFAULT } from '../../types/ppdm'
import type { Gaps, UnprotectedAsset } from '../../types/reportView'
import { cellNum, cellStr } from './rows'
import { topN } from './topN'

/**
 * Avamar/NetWorker never size never-backed-up clients — showing "unknown" on
 * every row plus a TB KPI is noise, not information. Single shared gate used
 * everywhere a renderer decides between a sized (TB) and sizeless (count) view.
 */
export function hasGapSizes(gaps: Gaps): boolean {
  return gaps.totalCapacityGb !== undefined || gaps.top.items.some((a) => a.sizeGb !== undefined)
}

/** Unprotected-asset gaps: count, total capacity, and the largest N by size. */
export function findGaps(wb: RawWorkbook, n: number = TOP_N_DEFAULT): Gaps {
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
    totalCapacityGb += asset.sizeGb ?? 0
  }
  return { count: assets.length, totalCapacityGb, top: topN(assets, n, (a) => a.sizeGb ?? 0) }
}
