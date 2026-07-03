import type { Cell, RawWorkbook } from '../../../types/ppdm'
import {
  type CapacityTrend,
  computeCapacityTrend,
  type UtilizationSample,
} from '../../aggregation/capacityTrend'
import { cellNum, cellStr } from '../../aggregation/rows'
import { serialToIso } from '../../parser/serialToIso'

/**
 * Avamar's `Max Utilization (%)` column is a 0..1 RATIO in some exports (e.g. 0.92)
 * and a plain PERCENT in others (e.g. 5.85 … 27.69). Per sheet: when every present
 * value is ≤ 1 the sheet is ratio-scaled → ×100; otherwise values are already percent.
 */
export function utilizationScaleFactor(rows: Record<string, Cell>[]): number {
  let max = Number.NEGATIVE_INFINITY
  for (const r of rows) {
    if (cellStr(r, 'Max Utilization (%)') === '') continue
    const v = cellNum(r, 'Max Utilization (%)')
    if (v > max) max = v
  }
  return max > 1 ? 1 : 100
}

/** Per-node utilization time series → observed trend. Pure. */
export function avamarCapacityTrend(wb: RawWorkbook): CapacityTrend {
  const rows = wb.sheets['Node Utilization']?.rows ?? []
  const scale = utilizationScaleFactor(rows)
  const prefix = wb.meta.customer || 'Avamar'
  const samples: UtilizationSample[] = []
  for (const r of rows) {
    if (cellStr(r, 'Max Utilization (%)') === '' || cellStr(r, 'Date') === '') continue
    const serial = cellNum(r, 'Date')
    if (serial <= 0) continue
    samples.push({
      target: `${prefix} / node ${cellStr(r, 'Node')}`,
      day: serialToIso(serial).slice(0, 10),
      pct: cellNum(r, 'Max Utilization (%)') * scale,
    })
  }
  return computeCapacityTrend(samples)
}
