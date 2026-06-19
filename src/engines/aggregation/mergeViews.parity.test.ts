import { describe, expect, it } from 'vitest'
import { detailWorkbookBuffer } from '../../test-helpers/workbooks'
import { mergeWorkbooks } from '../parser/mergeWorkbooks'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { mergeViews } from './mergeViews'
import { buildReportView } from './reportView'

/** Strip provenance, warnings, and normalize the float field that differs due to summation order. */
function strip(v: ReturnType<typeof buildReportView>) {
  const { provenance: _p, warnings: _w, ...rest } = v
  // Normalize gaps.totalCapacityGb to 0 so toEqual is not affected by this field.
  // IEEE-754 floating-point summation is non-associative: the legacy path sums all raw
  // "Unprotected Assets" rows linearly, while the view-level path sums per-server subtotals.
  // Per-server ReportViews carry only subtotals, so the exact row-order accumulation cannot
  // be reproduced — this is the expected, correct architecture, not a logic bug.
  return {
    ...rest,
    gaps: { ...rest.gaps, totalCapacityGb: 0 },
  }
}

describe('mergeViews parity with legacy sheet-level merge (detail estate)', () => {
  it('produces identical metrics for a two-server detail estate', () => {
    const wb = normalizeWorkbook(detailWorkbookBuffer())
    const servers = [
      { label: 'srv-a', workbook: wb },
      { label: 'srv-b', workbook: wb },
    ]
    const legacy = buildReportView(mergeWorkbooks(servers))
    const next = mergeViews(servers.map((s) => buildReportView(s.workbook)))

    // IEEE-754 non-associativity: per-server subtotal summation differs from raw-row summation.
    // (With integer synthetic sizes the two paths coincide exactly; the tolerance still holds.)
    expect(next.gaps.totalCapacityGb).toBeCloseTo(legacy.gaps.totalCapacityGb, 6)

    // All other fields must match exactly (provenance and warnings are structurally excluded).
    expect(strip(next)).toEqual(strip(legacy))
  })
})
