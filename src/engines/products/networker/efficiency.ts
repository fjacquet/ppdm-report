import type { RawWorkbook } from '../../../types/ppdm'
import {
  type Efficiency,
  emptyRetentionBuckets,
  type RetentionBucketId,
  type WeightedRatio,
} from '../../aggregation/efficiency'
import { cellNum, cellStr } from '../../aggregation/rows'

/** KPI rows are raw capacity sums (allowed); every other KPI row is a vendor rate (ignored). */
const KPI_RETENTION_ROWS: [string, RetentionBucketId][] = [
  ['Total Capacity with Retention < 30 Days (TB)', 'r30'],
  ['Total Capacity with Retention < 60 Days (TB)', 'r60'],
  ['Total Capacity with Retention < 180 Days (TB)', 'r180'],
  ['Total Capacity with Retention < 365 Days (TB)', 'r1y'],
  ['Total Capacity with Retention < 7 Years (TB)', 'r7y'],
  ['Total Capacity with Retention >= 7 Years (TB)', 'r7yPlus'],
]

/** NetWorker efficiency: DD global dedupe + weighted job reduction ratio + KPI retention
 * profile (TB→GB base-10). Change rate / encryption / replication health are not
 * computable from NetWorker exports. Pure. */
export function networkerEfficiency(wb: RawWorkbook): Efficiency {
  const out: Efficiency = {}

  let logicalGb = 0
  let usedGb = 0
  let sawDd = false
  for (const r of wb.sheets['Data Domains']?.rows ?? []) {
    if (cellStr(r, 'Used Logical Capacity (GB)') === '' || cellStr(r, 'Used Capacity (GB)') === '')
      continue
    sawDd = true
    logicalGb += cellNum(r, 'Used Logical Capacity (GB)')
    usedGb += cellNum(r, 'Used Capacity (GB)')
  }

  let jobRatio: WeightedRatio | undefined
  for (const r of wb.sheets['Dedup Jobs']?.rows ?? []) {
    const ratio = cellNum(r, 'Data Reduction Ratio')
    const cap = cellNum(r, 'Capacity (GB)')
    if (ratio <= 0 || cap <= 0) continue
    jobRatio = jobRatio ?? { num: 0, den: 0 }
    jobRatio.num += ratio * cap
    jobRatio.den += cap
  }

  if ((sawDd && usedGb > 0) || jobRatio) {
    out.dedupe = {
      lowDedupe: { items: [], total: 0, shown: 0 },
      global: sawDd && usedGb > 0 ? { logicalGb, usedGb } : undefined,
      jobRatio,
    }
  }

  const kpis = wb.sheets.KPIs?.rows ?? []
  if (kpis.length > 0) {
    const byMetric = new Map(kpis.map((r) => [cellStr(r, 'Metric'), r]))
    const total = emptyRetentionBuckets()
    let saw = false
    for (const [metric, id] of KPI_RETENTION_ROWS) {
      const row = byMetric.get(metric)
      if (!row || cellStr(row, 'Value') === '') continue
      saw = true
      total[id] = cellNum(row, 'Value') * 1000 // TB → GB, base-10
    }
    if (saw) out.retention = { totalGbByBucket: total, perPolicyType: [] }
  }

  return out
}
