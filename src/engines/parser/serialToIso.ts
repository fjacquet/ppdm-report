/** Days between the Excel epoch (1899-12-30) and the Unix epoch (1970-01-01). */
const EXCEL_UNIX_OFFSET_DAYS = 25569
const MS_PER_DAY = 86_400_000

/** Convert an Excel serial date (base 1899-12-30) to an ISO-8601 UTC string. */
export function serialToIso(serial: number): string {
  const ms = Math.round((serial - EXCEL_UNIX_OFFSET_DAYS) * MS_PER_DAY)
  return new Date(ms).toISOString()
}
