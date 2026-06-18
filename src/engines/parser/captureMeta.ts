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

/** Read the key/value Details sheet into validated CaptureMeta. */
export function captureMeta(wb: XLSX.WorkBook): CaptureMeta {
  const ws = wb.Sheets.Details
  const kv = new Map<string, Cell>()
  if (ws) {
    const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as Cell[][]
    for (const row of aoa) {
      const key = String(row[0] ?? '').trim()
      if (key) kv.set(key, row[1] ?? null)
    }
  }
  const date = kv.get('Date')
  const disclaimer = String(kv.get('Disclaimer') ?? '')
  return CaptureMetaSchema.parse({
    projectId: String(kv.get('Project ID') ?? ''),
    customer: String(kv.get('Project Name') ?? ''),
    collectorBuild: String(kv.get('Collector Build Version') ?? ''),
    capturedAt: typeof date === 'number' ? serialToIso(date) : String(date ?? ''),
    baseTen: /base\s*10/i.test(disclaimer),
  })
}
