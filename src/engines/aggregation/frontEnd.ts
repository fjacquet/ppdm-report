import type { RawWorkbook, SheetData } from '../../types/ppdm'
import type { FrontEnd, FrontEndTypeRow } from '../../types/reportView'
import { cellNum, cellStr } from './rows'

/** The four GB fields of a FrontEndTypeRow, in display order. */
export const FRONT_END_METRICS = [
  'protectedDiscoveredGb',
  'protectedFetbGb',
  'unprotectedDiscoveredGb',
  'unprotectedFetbGb',
] as const

/** An empty front-end value (no in-use types, nothing excluded). */
export function emptyFrontEnd(): FrontEnd {
  return { byType: [], excludedCount: 0 }
}

/** Fold per-server FrontEnd values: union types, sum defined fields (undefined until a reporter). */
export function mergeFrontEnd(frontEnds: FrontEnd[]): FrontEnd {
  const byType = new Map<string, FrontEndTypeRow>()
  for (const fe of frontEnds) {
    for (const row of fe.byType) {
      const acc = byType.get(row.type) ?? { type: row.type }
      for (const k of FRONT_END_METRICS) {
        const add = row[k]
        if (add !== undefined) acc[k] = (acc[k] ?? 0) + add
      }
      byType.set(row.type, acc)
    }
  }
  return {
    byType: [...byType.values()],
    excludedCount: frontEnds.reduce((a, fe) => a + fe.excludedCount, 0),
  }
}

const DISCOVERED_COLS = [
  'Asset Total Discovered Size (GB)',
  'Asset Total Size (GB)',
  'Discovered Size (GB)',
]
const FETB_COLS = [
  'Asset Licensed Size (GB)',
  'Asset Licensed Protection Size (GB)',
  'Asset Protection Size (Licensed) (GB)',
  'Protection Capacity (GB)',
  'Asset FETB (GB)',
]

/** First candidate column present in the sheet's headers; '' when none match. */
function resolveCol(sheet: SheetData, candidates: string[]): string {
  return candidates.find((c) => sheet.headers.includes(c)) ?? ''
}

interface Bucket {
  count: number
  sum: number
  colPresent: boolean
}

/** Tri-state: 0 for an empty bucket (measured), the sum when > 0, undefined when assets exist
 * but the column is absent or sums to 0 (no figure). */
function resolveSize(b: Bucket): number | undefined {
  if (b.count === 0) return 0
  if (!b.colPresent) return undefined
  return b.sum > 0 ? b.sum : undefined
}

/** Front-end volume per workload type from Avamar's `Client Capacity` sheet.
 * Clients in that sheet have backups, so values populate `protectedDiscoveredGb`
 * (peak GiB, base-2); the other three fields stay undefined ("–"). Pure. */
export function computeAvamarFrontEnd(wb: RawWorkbook): FrontEnd {
  const rows = wb.sheets['Client Capacity']?.rows ?? []
  const byApp = new Map<string, number>()
  for (const r of rows) {
    const app = cellStr(r, 'Application')
    if (app === '') continue
    byApp.set(app, (byApp.get(app) ?? 0) + cellNum(r, 'Max Peak GiB'))
  }
  const byType: FrontEndTypeRow[] = [...byApp.entries()].map(([type, gb]) => ({
    type,
    protectedDiscoveredGb: gb,
  }))
  return { byType, excludedCount: 0 }
}

/** Front-end volume per in-use workload type, split protected/unprotected. PPDM detail only. Pure. */
export function computeFrontEnd(wb: RawWorkbook, inUse: string[]): FrontEnd {
  const byType: FrontEndTypeRow[] = []
  let excludedCount = 0
  for (const name of inUse) {
    const sheet = wb.sheets[name]
    if (!sheet) continue
    const discCol = resolveCol(sheet, DISCOVERED_COLS)
    const fetbCol = resolveCol(sheet, FETB_COLS)
    const pd: Bucket = { count: 0, sum: 0, colPresent: discCol !== '' }
    const pf: Bucket = { count: 0, sum: 0, colPresent: fetbCol !== '' }
    const ud: Bucket = { count: 0, sum: 0, colPresent: discCol !== '' }
    const uf: Bucket = { count: 0, sum: 0, colPresent: fetbCol !== '' }
    for (const row of sheet.rows) {
      const status = cellStr(row, 'Protection Status')
      if (status === 'EXCLUDED') {
        excludedCount++
        continue
      }
      const disc = discCol ? cellNum(row, discCol) : 0
      const fetb = fetbCol ? cellNum(row, fetbCol) : 0
      if (status === 'PROTECTED') {
        pd.count++
        pd.sum += disc
        pf.count++
        pf.sum += fetb
      } else if (status === 'UNPROTECTED') {
        ud.count++
        ud.sum += disc
        uf.count++
        uf.sum += fetb
      }
    }
    byType.push({
      type: name,
      protectedDiscoveredGb: resolveSize(pd),
      protectedFetbGb: resolveSize(pf),
      unprotectedDiscoveredGb: resolveSize(ud),
      unprotectedFetbGb: resolveSize(uf),
    })
  }
  return { byType, excludedCount }
}
