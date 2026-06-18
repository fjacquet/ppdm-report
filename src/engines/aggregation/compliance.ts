import type { ParsedWorkbook } from '../../types/ppdm'
import type { Compliance } from '../../types/reportView'
import { cellStr, countBy } from './rows'

/** Copy-level compliance posture over the (possibly capped) copy window. */
export function computeCompliance(wb: ParsedWorkbook): Compliance {
  const sheet = wb.sheets.Copies
  const rows = sheet?.rows ?? []
  const n = rows.length

  let appConsistent = 0
  let immutable = 0
  let replicated = 0
  for (const r of rows) {
    if (cellStr(r, 'Data Consistency') === 'APPLICATION_CONSISTENT') appConsistent++
    const lock = cellStr(r, 'Lock Status')
    if (lock !== '' && lock !== 'ALL_COPIES_UNLOCKED') immutable++
    if (cellStr(r, 'Replica').toUpperCase() === 'TRUE') replicated++
  }

  return {
    appConsistentPct: n > 0 ? appConsistent / n : 0,
    immutablePct: n > 0 ? immutable / n : 0,
    replicatedPct: n > 0 ? replicated / n : 0,
    backupLevelMix: countBy(rows, 'Backup Level'),
    windowSize: n,
    capped: sheet?.capped ?? false,
  }
}
