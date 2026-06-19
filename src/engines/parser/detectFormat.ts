import type { ParsedWorkbook } from '../../types/ppdm'

export type WorkbookFormat = 'detail' | 'summary'

/** Older summary exports carry a "System Configuration" sheet plus pre-aggregated
 *  "... Count And Cap" / "... Assets & Cap" sheets, and no per-asset rows. */
export function detectFormat(wb: ParsedWorkbook): WorkbookFormat {
  const names = Object.keys(wb.sheets)
  const hasSysConfig = names.includes('System Configuration')
  const hasCountCap = names.some((n) => /Count\s*(?:And|&)\s*Cap|Assets?\s*&\s*Cap/i.test(n))
  return hasSysConfig && hasCountCap ? 'summary' : 'detail'
}
