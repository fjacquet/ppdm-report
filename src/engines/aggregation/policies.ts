import type { RawWorkbook } from '../../types/ppdm'
import type { Policies, PolicyRow } from '../../types/reportView'
import { cellNum, cellStr, countBy } from './rows'

/** Protection-policy summary: count, purpose tally, and per-policy detail. */
export function summarizePolicies(wb: RawWorkbook): Policies {
  const rows = wb.sheets.Policies?.rows ?? []
  const perPolicy: PolicyRow[] = rows.map((r) => ({
    name: cellStr(r, 'Name'),
    purpose: cellStr(r, 'Purpose'),
    assetCount: cellNum(r, 'Number of Assets'),
    protectionCapacityGb: cellNum(r, 'Total Asset Protection Capacity (GB)'),
  }))
  return { count: rows.length, byPurpose: countBy(rows, 'Purpose'), perPolicy }
}
