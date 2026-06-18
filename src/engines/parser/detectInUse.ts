import type { Cell, SheetData } from '../../types/ppdm'
import { AGENT_SHEETS } from '../../types/ppdm'

/** A cell counts as a placeholder when it is empty or the literal "N/A". */
function isPlaceholder(value: Cell): boolean {
  if (value === null || value === undefined) return true
  const s = String(value).trim()
  return s === '' || s === 'N/A'
}

/** A sheet is "in use" when at least one data row holds a real (non-placeholder) value. */
export function sheetIsInUse(sheet: SheetData): boolean {
  return sheet.rows.some((row) => Object.values(row).some((v) => !isPlaceholder(v)))
}

/** Split the known agent/asset-type sheets into in-use vs present-but-idle. */
export function classifyAgents(sheets: SheetData[]): { inUse: string[]; idleAgents: string[] } {
  const byName = new Map(sheets.map((s) => [s.name, s]))
  const inUse: string[] = []
  const idleAgents: string[] = []
  for (const name of AGENT_SHEETS) {
    const sheet = byName.get(name)
    if (!sheet) continue
    if (sheetIsInUse(sheet)) inUse.push(name)
    else idleAgents.push(name)
  }
  return { inUse, idleAgents }
}
