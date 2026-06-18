import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { computeCoverage } from './coverage'

function wb(sheets: Record<string, Array<Record<string, string>>>, inUse: string[]): ParsedWorkbook {
  const sheetData: Record<string, SheetData> = {}
  for (const [name, rows] of Object.entries(sheets)) {
    sheetData[name] = { name, headers: Object.keys(rows[0] ?? {}), rows, capped: false }
  }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: sheetData,
    inUse,
    idleAgents: [],
    warnings: [],
  }
}

describe('computeCoverage', () => {
  it('computes per-type and overall bands with both coverage figures', () => {
    const cov = computeCoverage(
      wb(
        {
          'SQL Databases': [
            ...Array(380).fill({ 'Protection Status': 'PROTECTED' }),
            ...Array(150).fill({ 'Protection Status': 'UNPROTECTED' }),
            ...Array(224).fill({ 'Protection Status': 'EXCLUDED' }),
          ],
        },
        ['SQL Databases'],
      ),
    )
    const sql = cov.byType['SQL Databases']!
    expect(sql.protected).toBe(380)
    expect(sql.unprotected).toBe(150)
    expect(sql.excluded).toBe(224)
    expect(sql.pct).toBeCloseTo(380 / 530, 4)
    expect(sql.pctInclExcluded).toBeCloseTo(380 / 754, 4)
    expect(cov.overall.protected).toBe(380)
  })

  it('returns 0 pct for an empty denominator, never NaN', () => {
    const cov = computeCoverage(wb({ 'File Systems': [{ 'Protection Status': 'EXCLUDED' }] }, ['File Systems']))
    expect(cov.byType['File Systems']!.pct).toBe(0)
    expect(cov.byType['File Systems']!.pctInclExcluded).toBe(0)
  })

  it('ignores sheets not in inUse', () => {
    const cov = computeCoverage(
      wb({ 'Oracle Databases': [{ 'Protection Status': 'PROTECTED' }] }, []),
    )
    expect(cov.byType['Oracle Databases']).toBeUndefined()
    expect(cov.overall.protected).toBe(0)
  })
})
