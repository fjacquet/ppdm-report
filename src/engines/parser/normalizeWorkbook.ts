import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'
import { captureMeta } from './captureMeta'
import { readWorkbook, toSheetData } from './readWorkbook'

/** Parse a Live Optics .xlsx into a product-neutral normalized workbook. */
export function normalizeWorkbook(buf: ArrayBuffer): RawWorkbook {
  const wb = readWorkbook(buf)
  const sheetList = toSheetData(wb)
  const sheets: Record<string, SheetData> = {}
  for (const s of sheetList) sheets[s.name] = s

  const warnings: string[] = []
  for (const s of sheetList) {
    if (s.capped) {
      warnings.push(
        `Sheet "${s.name}" reached the ${LIVE_OPTICS_ROW_CAP.toLocaleString()}-row export cap; figures derived from it are a window, not the full set.`,
      )
    }
  }

  return { meta: captureMeta(wb), sheets, warnings }
}
