import type { ServerWorkbook } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'
import { appHostName } from './deriveLabel'
import { detectFormat } from './detectFormat'

/** Estate-level data caveats (always warn, never block). Single source → its own warnings, verbatim. */
export function estateWarnings(servers: ServerWorkbook[]): string[] {
  if (servers.length <= 1) return servers[0]?.workbook.warnings ?? []
  const out: string[] = []

  for (const s of servers) {
    for (const w of s.workbook.warnings) out.push(`[${s.label}] ${w}`)
  }

  const bases = new Set(servers.map((s) => s.workbook.meta.baseTen))
  if (bases.size > 1) {
    out.push(
      'Source exports mix base-10 and base-2 units; combined capacity figures span different measurement scales.',
    )
  }

  const seen = new Map<string, string>()
  for (const s of servers) {
    const host = appHostName(s.workbook)
    const key = host || `${s.workbook.meta.projectId}|${s.workbook.meta.capturedAt}`
    if (!key || key === '|') continue
    const prev = seen.get(key)
    if (prev) {
      out.push(
        `"${prev}" and "${s.label}" appear to be the same PPDM server/snapshot; figures may be double-counted.`,
      )
    } else {
      seen.set(key, s.label)
    }
  }

  const names = new Set(servers.flatMap((s) => Object.keys(s.workbook.sheets)))
  const multiCapped = [...names].some(
    (name) => servers.filter((s) => s.workbook.sheets[name]?.capped).length >= 2,
  )
  if (multiCapped) {
    out.push(
      `One or more sheets reached the ${LIVE_OPTICS_ROW_CAP.toLocaleString()}-row cap in multiple source servers; combined figures from them blend independent windows, not the full set.`,
    )
  }

  const formats = new Set(servers.map((s) => detectFormat(s.workbook)))
  if (formats.size > 1) {
    out.push(
      'Estate mixes detail-format and summary-format exports; metrics marked with a coverage note reflect only the servers that provide that data.',
    )
  }

  return out
}
