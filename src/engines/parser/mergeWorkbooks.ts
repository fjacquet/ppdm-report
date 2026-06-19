import type { RawWorkbook, ServerWorkbook, SheetData } from '../../types/ppdm'
import { estateWarnings } from './estateWarnings'
import { foldMeta } from './foldMeta'

/** Fold N parsed PPDM workbooks into one estate workbook. Pure.
 * Single source returns that workbook unchanged (identity). */
export function mergeWorkbooks(servers: ServerWorkbook[]): RawWorkbook {
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

  const meta = foldMeta(workbooks.map((w) => w.meta))

  return { meta, sheets, warnings: estateWarnings(servers) }
}
