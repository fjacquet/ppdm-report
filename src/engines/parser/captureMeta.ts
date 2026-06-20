import * as XLSX from 'xlsx'
import { z } from 'zod'
import type { CaptureMeta, Cell } from '../../types/ppdm'
import { serialToIso } from './serialToIso'

const CaptureMetaSchema = z.object({
  projectId: z.string(),
  customer: z.string(),
  collectorBuild: z.string(),
  capturedAt: z.string(),
  baseTen: z.boolean(),
})

/** Parse a "DD/MM/YYYY HH:mm:ss" string as UTC ISO-8601; '' when unparseable. */
function parseTextDate(s: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(s.trim())
  if (!m) return ''
  const dd = m[1] as string
  const mm = m[2] as string
  const yyyy = m[3] as string
  const hh = m[4] as string
  const mi = m[5] as string
  const ss = m[6] as string
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss))
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== +yyyy ||
    d.getUTCMonth() !== +mm - 1 ||
    d.getUTCDate() !== +dd ||
    d.getUTCHours() !== +hh ||
    d.getUTCMinutes() !== +mi ||
    d.getUTCSeconds() !== +ss
  )
    return ''
  return d.toISOString()
}

/** Read the key/value Details sheet into validated CaptureMeta. */
export function captureMeta(wb: XLSX.WorkBook): CaptureMeta {
  const ws = wb.Sheets.Details
  const kv = new Map<string, Cell>()
  const disclaimers: string[] = []
  if (ws) {
    const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as Cell[][]
    for (const row of aoa) {
      const key = String(row[0] ?? '').trim()
      if (!key) continue
      if (key === 'Disclaimer' || key.startsWith('Disclaimer '))
        disclaimers.push(String(row[1] ?? ''))
      else kv.set(key, row[1] ?? null)
    }
  }
  const date = kv.get('Date')
  return CaptureMetaSchema.parse({
    projectId: String(kv.get('Project ID') ?? ''),
    customer: String(kv.get('Project Name') ?? ''),
    collectorBuild: String(kv.get('Collector Build Version') ?? ''),
    capturedAt: typeof date === 'number' ? serialToIso(date) : parseTextDate(String(date ?? '')),
    baseTen: disclaimers.some((d) => /base\s*10/i.test(d)),
  })
}
