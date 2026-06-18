import type { Cell } from '../../types/ppdm'

type Row = Record<string, Cell>

/** Trimmed string for a column; '' for null/empty/'N/A'/missing. */
export function cellStr(row: Row, key: string): string {
  const v = row[key]
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  return s === 'N/A' ? '' : s
}

/** Numeric value for a column (commas stripped); 0 when absent/non-numeric. */
export function cellNum(row: Row, key: string): number {
  const v = row[key]
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = cellStr(row, key).replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) && s !== '' ? n : 0
}

/** Tally non-blank values of a column. */
export function countBy(rows: Row[], key: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const k = cellStr(row, key)
    if (k) out[k] = (out[k] ?? 0) + 1
  }
  return out
}
