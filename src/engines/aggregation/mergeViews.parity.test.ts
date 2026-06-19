import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mergeWorkbooks } from '../parser/mergeWorkbooks'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { mergeViews } from './mergeViews'
import { buildReportView } from './reportView'

/** Strip the new provenance field; the legacy path can't produce per-server denominators. */
function omitProvenance(v: ReturnType<typeof buildReportView>) {
  const { provenance: _p, warnings: _w, ...rest } = v
  return rest
}

describe('mergeViews parity with legacy sheet-level merge (detail estate)', () => {
  it('produces identical metrics for a two-server detail estate', () => {
    const wb = normalizeWorkbook(new Uint8Array(readFileSync('ref/PPDM.xlsx')).buffer)
    const servers = [
      { label: 'srv-a', workbook: wb },
      { label: 'srv-b', workbook: wb },
    ]
    const legacy = buildReportView(mergeWorkbooks(servers))
    const next = mergeViews(servers.map((s) => buildReportView(s.workbook)))
    expect(omitProvenance(next)).toEqual(omitProvenance(legacy))
  })
})
