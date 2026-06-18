import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'
import { captureMeta } from './captureMeta'
import { classifyAgents } from './detectInUse'
import { readWorkbook, toSheetData } from './readWorkbook'

/** Parse a Live Optics PPDM .xlsx into a fully normalized, classified workbook. */
export function normalizeWorkbook(buf: ArrayBuffer): ParsedWorkbook {
  const wb = readWorkbook(buf)
  const sheetList = toSheetData(wb)
  const sheets: Record<string, SheetData> = {}
  for (const s of sheetList) sheets[s.name] = s

  const { inUse, idleAgents } = classifyAgents(sheetList)

  const warnings: string[] = []
  for (const s of sheetList) {
    if (s.capped) {
      warnings.push(
        `Sheet "${s.name}" reached the ${LIVE_OPTICS_ROW_CAP.toLocaleString()}-row export cap; figures derived from it are a window, not the full set.`,
      )
    }
  }

  return { meta: captureMeta(wb), sheets, inUse, idleAgents, warnings }
}
