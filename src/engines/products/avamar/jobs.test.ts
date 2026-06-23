import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarJobs } from './jobs'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('avamarJobs', () => {
  it('derives buckets from Avamar DPN Summary backups only (restore excluded)', () => {
    const j = avamarJobs(
      wb({
        'Avamar DPN Summary': [
          ['Server', 'Operation', 'Status'],
          ['s', 'On-Demand Backup', 'Activity completed successfully.'],
          ['s', 'On-Demand Backup', 'Activity completed successfully.'],
          ['s', 'Scheduled Backup', 'Activity completed with exceptions.'],
          ['s', 'On-Demand Backup', 'Activity failed - client error(s).'],
          ['s', 'Restore', 'Activity completed successfully.'],
        ],
      }),
    )
    expect(j.counts).toEqual({ SUCCESS: 2, EXCEPTION: 1, FAILED: 1 })
    expect(j.total).toBe(4)
    expect(j.successPct).toBeCloseTo(0.5, 6)
    expect(j.capped).toBe(false)
  })

  it('falls back to Backup Completion Summary when no detail rows', () => {
    const j = avamarJobs(
      wb({
        'Backup Completion Summary': [
          ['Total', 'Successful', 'Exception', 'Failed'],
          [10, 7, 1, 2],
        ],
      }),
    )
    expect(j.counts).toEqual({ SUCCESS: 7, EXCEPTION: 1, FAILED: 2 })
    expect(j.total).toBe(10)
    expect(j.successPct).toBeCloseTo(0.7, 6)
    expect(j.capped).toBe(false)
  })
})
