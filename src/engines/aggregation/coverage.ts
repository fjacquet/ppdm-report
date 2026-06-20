import type { RawWorkbook } from '../../types/ppdm'
import type { Coverage, CoverageBand } from '../../types/reportView'
import { classifyAgents } from '../parser/detectInUse'
import { cellStr } from './rows'

export function emptyBand(): CoverageBand {
  return { protected: 0, unprotected: 0, excluded: 0, pct: 0, pctInclExcluded: 0 }
}

export function finalizeBand(b: CoverageBand): CoverageBand {
  const denom = b.protected + b.unprotected
  const denomAll = denom + b.excluded
  return {
    ...b,
    pct: denom > 0 ? b.protected / denom : 0,
    pctInclExcluded: denomAll > 0 ? b.protected / denomAll : 0,
  }
}

/** Protection coverage per in-use asset type and overall. */
export function computeCoverage(wb: RawWorkbook): Coverage {
  const byType: Record<string, CoverageBand> = {}
  const overall = emptyBand()

  const { inUse } = classifyAgents(Object.values(wb.sheets))
  for (const name of inUse) {
    const sheet = wb.sheets[name]
    if (!sheet) continue
    const band = emptyBand()
    for (const row of sheet.rows) {
      const status = cellStr(row, 'Protection Status')
      if (status === 'PROTECTED') band.protected++
      else if (status === 'UNPROTECTED') band.unprotected++
      else if (status === 'EXCLUDED') band.excluded++
    }
    overall.protected += band.protected
    overall.unprotected += band.unprotected
    overall.excluded += band.excluded
    byType[name] = finalizeBand(band)
  }

  return { byType, overall: finalizeBand(overall) }
}
