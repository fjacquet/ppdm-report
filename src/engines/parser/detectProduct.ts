import type { ProductId, SheetData } from '../../types/ppdm'

/**
 * Classify a workbook by sheet-name signature. Pure and name-based — each
 * product carries an unambiguous marker; order is just a safety net.
 * PPDM internal detail-vs-summary is decided later by `detectFormat`.
 */
export function detectProduct(wb: { sheets: Record<string, SheetData> }): ProductId {
  const has = (name: string) => name in wb.sheets

  if (has('Avamar DPN Summary') || (has('Backup Completion Summary') && has('Backup Plugins'))) {
    return 'avamar'
  }
  if (has('Storage Nodes') && has('Dedup Jobs')) return 'networker'
  if (has('System Configuration') || has('Data Domain Mtrees') || has('Storage Targets')) {
    return 'ppdm'
  }
  return 'unknown'
}
