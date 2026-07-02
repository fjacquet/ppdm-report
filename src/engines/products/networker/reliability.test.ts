import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { networkerReliability } from './reliability'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('networkerReliability', () => {
  it('keeps only backup-carrying job types and maps statuses/durations', () => {
    const r = networkerReliability(
      wb({
        Jobs: [
          ['Job Type', 'Client Name', 'Completion Status', 'Start Time', 'End Time'],
          ['save job', 'c1', 'Failed', 46201.5, 46201.51],
          ['save job', 'c1', 'Failed', 46202.5, 46202.51],
          ['vproxysave job', 'c1', 'Failed', 46203.5, 46203.51],
          ['backup action job', 'c2', 'Succeeded', 46203.5, 46203.75], // 6 h
          ['utility job', 'c3', 'Failed', 46201.5, 46201.51], // excluded
          ['workflow job', 'c3', 'Failed', 46202.5, 46202.51], // excluded
          ['save job', 'c4', 'N/A', 46203.5, 46203.51], // exception bucket
        ],
        'Client Statistics': [
          ['Hostname', 'Success Rate'],
          ['c1', 25],
        ],
      }),
    )
    expect(r.repeatFailures.total).toBe(1)
    expect(r.repeatFailures.items[0]).toMatchObject({
      host: 'c1',
      failureDays: 3,
      successRatePct: 25,
    })
    expect(r.runtime.h4to8).toBe(1) // the 6-hour job
    expect(r.runtimeTotal).toBe(5) // 5 backup jobs with durations
    expect(r.queue).toBeUndefined() // NetWorker exposes no queued timestamp
  })
})
