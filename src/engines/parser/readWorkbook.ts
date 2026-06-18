import * as XLSX from 'xlsx'
import type { Cell, SheetData } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'

/** Read an .xlsx ArrayBuffer into a SheetJS workbook. */
export function readWorkbook(buf: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buf, { type: 'array' })
}

/** Convert every worksheet into a SheetData (header row + keyed data rows). */
export function toSheetData(wb: XLSX.WorkBook): SheetData[] {
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name] ?? ({} as XLSX.WorkSheet)
    const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as Cell[][]
    const headers = (aoa[0] ?? []).map((h) => String(h ?? '').trim())
    const dataRows = aoa.slice(1)
    const rows = dataRows.map((r) => {
      const obj: Record<string, Cell> = {}
      headers.forEach((h, i) => {
        if (h) obj[h] = r[i] ?? null
      })
      return obj
    })
    return { name, headers, rows, capped: dataRows.length >= LIVE_OPTICS_ROW_CAP }
  })
}

/** Convenience: read + convert in one call (used by tests and standalone parsing). */
export function parseXlsx(buf: ArrayBuffer): SheetData[] {
  return toSheetData(readWorkbook(buf))
}
