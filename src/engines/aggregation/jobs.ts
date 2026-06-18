import type { ParsedWorkbook } from '../../types/ppdm'
import type { Jobs } from '../../types/reportView'
import { countBy } from './rows'

/** Protection-job result mix and success rate over the (possibly capped) activity window. */
export function computeJobs(wb: ParsedWorkbook): Jobs {
  const sheet = wb.sheets['Protection Job Activities']
  const rows = sheet?.rows ?? []
  const counts = countBy(rows, 'Result')
  const total = rows.length
  const success = counts.SUCCESS ?? 0
  return {
    counts,
    total,
    successPct: total > 0 ? success / total : 0,
    capped: sheet?.capped ?? false,
    windowSize: total,
  }
}
