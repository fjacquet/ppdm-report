import type { FrontEnd, FrontEndTypeRow } from '../../types/reportView'

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
