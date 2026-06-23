import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarReplication } from './replication'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('avamarReplication', () => {
  it('computes replicatedPct from the Replication completion-status totals', () => {
    const c = avamarReplication(
      wb({
        'Replication (Completion Status)': [
          ['Status', 'Total'],
          ['Activity completed successfully.', 90],
          ['Activity failed - client error(s).', 10],
        ],
      }),
    )
    expect(c.replicatedCount).toBe(90)
    expect(c.windowSize).toBe(100)
    expect(c.replicatedPct).toBeCloseTo(0.9, 6)
    // app-consistency + immutability are N/A → 0 (NetWorker precedent)
    expect(c.appConsistentPct).toBe(0)
    expect(c.immutablePct).toBe(0)
    expect(c.capped).toBe(false)
  })

  it('zero replicatedPct when the sheet is absent', () => {
    const c = avamarReplication(wb({ Details: [['Project Name', 'x']] }))
    expect(c.replicatedPct).toBe(0)
    expect(c.windowSize).toBe(0)
  })
})
