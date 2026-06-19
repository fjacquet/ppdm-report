import type { ParsedWorkbook, ServerWorkbook, SheetData } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'
import { appHostName } from './deriveLabel'
import { classifyAgents } from './detectInUse'
import { foldMeta } from './foldMeta'

/** Fold N parsed PPDM workbooks into one estate workbook. Pure.
 * Single source returns that workbook unchanged (identity). */
export function mergeWorkbooks(servers: ServerWorkbook[]): ParsedWorkbook {
  if (servers.length === 0) throw new Error('mergeWorkbooks requires at least one server')
  const [first, ...rest] = servers as [ServerWorkbook, ...ServerWorkbook[]]
  if (rest.length === 0) return first.workbook

  const workbooks = servers.map((s) => s.workbook)

  const sheetNames: string[] = []
  for (const w of workbooks) {
    for (const name of Object.keys(w.sheets)) {
      if (!sheetNames.includes(name)) sheetNames.push(name)
    }
  }

  const sheets: Record<string, SheetData> = {}
  for (const name of sheetNames) {
    const present = workbooks
      .map((w) => w.sheets[name])
      .filter((s): s is SheetData => s !== undefined)
    const headers: string[] = []
    for (const s of present) {
      for (const h of s.headers) if (!headers.includes(h)) headers.push(h)
    }
    sheets[name] = {
      name,
      headers,
      rows: present.flatMap((s) => s.rows),
      capped: present.some((s) => s.capped),
    }
  }

  const { inUse, idleAgents } = classifyAgents(Object.values(sheets))

  const meta = foldMeta(workbooks.map((w) => w.meta))

  return { meta, sheets, inUse, idleAgents, warnings: mergeWarnings(servers) }
}

/** Estate-level data caveats (always warn, never block). */
function mergeWarnings(servers: ServerWorkbook[]): string[] {
  const out: string[] = []

  // 1. Carry over each source warning, attributed to its server.
  for (const s of servers) {
    for (const w of s.workbook.warnings) out.push(`[${s.label}] ${w}`)
  }

  // 2. Unit mismatch — base-10 vs base-2.
  const bases = new Set(servers.map((s) => s.workbook.meta.baseTen))
  if (bases.size > 1) {
    out.push(
      'Source exports mix base-10 and base-2 units; combined capacity figures span different measurement scales.',
    )
  }

  // 3. Duplicate suspicion — same appliance host, else same project+snapshot.
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

  // 4. Blended window — a sheet capped in 2+ sources.
  const names = new Set(servers.flatMap((s) => Object.keys(s.workbook.sheets)))
  const multiCapped = [...names].some(
    (name) => servers.filter((s) => s.workbook.sheets[name]?.capped).length >= 2,
  )
  if (multiCapped) {
    out.push(
      `One or more sheets reached the ${LIVE_OPTICS_ROW_CAP.toLocaleString()}-row cap in multiple source servers; combined figures from them blend independent windows, not the full set.`,
    )
  }

  return out
}
