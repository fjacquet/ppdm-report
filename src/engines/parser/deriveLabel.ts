import type { Cell, ParsedWorkbook } from '../../types/ppdm'

/** First data row of the single-row "System Information" sheet, if present. */
function systemInfoRow(wb: ParsedWorkbook): Record<string, Cell> | undefined {
  return wb.sheets['System Information']?.rows[0]
}

function field(wb: ParsedWorkbook, key: string): string {
  const v = systemInfoRow(wb)?.[key]
  return v === null || v === undefined ? '' : String(v).trim()
}

/** PPDM appliance host name from System Information; '' when absent. */
export function appHostName(wb: ParsedWorkbook): string {
  return field(wb, 'Host Name')
}

/** A System Information field with 'N/A' normalized to empty. */
function ppdmField(wb: ParsedWorkbook, key: string): string {
  const v = field(wb, key)
  return v.toUpperCase() === 'N/A' ? '' : v
}

/** PPDM version from System Information; falls back through naming variants. '' when absent. */
export function appVersion(wb: ParsedWorkbook): string {
  return (
    ppdmField(wb, 'PowerProtect Version') ||
    ppdmField(wb, 'Power Protect Version') ||
    ppdmField(wb, 'Product Version')
  )
}

/** A server's display label: appliance host name → Project Name → filename. */
export function deriveLabel(wb: ParsedWorkbook, filename: string): string {
  const host = appHostName(wb)
  if (host) return host
  const customer = wb.meta.customer.trim()
  if (customer) return customer
  return filename.replace(/\.xlsx$/i, '')
}

/** Make `base` unique against `existing` by appending " (2)", " (3)", … */
export function withUniqueLabel(existing: string[], base: string): string {
  if (!existing.includes(base)) return base
  let i = 2
  while (existing.includes(`${base} (${i})`)) i++
  return `${base} (${i})`
}
