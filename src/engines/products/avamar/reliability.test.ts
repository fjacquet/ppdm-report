import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarReliability } from './reliability'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

const FAIL = 'Activity failed - client error(s).'
const OK = 'Activity completed successfully.'

describe('avamarReliability', () => {
  it('maps DPN Summary to streaks and runtime; Job List Detailed to queue delay', () => {
    const r = avamarReliability(
      wb({
        'Avamar DPN Summary': [
          ['Host', 'Operation', 'Status', 'Start Date', 'Seconds'],
          ['h1', 'Scheduled Backup', FAIL, 46203.5, 60],
          ['h1', 'Scheduled Backup', FAIL, 46204.5, 60],
          ['h1', 'Scheduled Backup', FAIL, 46205.5, 60],
          ['h2', 'Scheduled Backup', OK, 46205.5, 7200],
          ['h2', 'Restore', FAIL, 46205.6, 60], // non-backup op — excluded
        ],
        'Job List Detailed': [
          ['Host', 'Time Queued (GMT)', 'Time Started (GMT)'],
          ['h1', 46203.5, 46203.52], // 0.48 h queued — delayed
          ['h2', 46203.5, 46203.5], // 0 h — not delayed
        ],
      }),
    )
    expect(r.repeatFailures.total).toBe(1)
    expect(r.repeatFailures.items[0]?.host).toBe('h1')
    expect(r.runtime.le15m).toBe(3) // 60 s each
    expect(r.runtime.h1to2).toBe(1) // 7200 s
    expect(r.queue?.delayedCount).toBe(1)
    expect(r.queue?.total).toBe(2)
  })

  it('falls back to Backup Runtime Summary when there is no DPN detail', () => {
    const r = avamarReliability(
      wb({
        'Backup Runtime Summary': [
          [
            '<=15 min',
            '>15-30 mins',
            '>30-60 mins',
            '>1-2 hours',
            '>2-4 hours',
            '>4-8 hours',
            '>8 hours',
          ],
          [10, 2, 3, 4, 5, 1, 9],
        ],
      }),
    )
    expect(r.runtime.le15m).toBe(10)
    expect(r.runtime.gt8h).toBe(9)
    expect(r.runtimeTotal).toBe(34)
    expect(r.repeatFailures.total).toBe(0)
  })
})
