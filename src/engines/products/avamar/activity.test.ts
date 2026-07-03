import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarActivity } from './activity'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

const HEADER = [
  'Job Type',
  'Host',
  'Policy Type',
  'Operating System',
  'Start Date',
  'Capacity (GiB)',
  '# Files',
  'MB/sec',
]

describe('avamarActivity', () => {
  it('derives byType, largest, slowest, daily, and osSplit from Job List Detailed backup rows', () => {
    const a = avamarActivity(
      wb({
        'Job List Detailed': [
          HEADER,
          // day 2026-06-30 — VM, two hosts sharing a type
          ['Backup', 'h1', 'VM', 'Windows Server 2019', 46203, 100, 1000, 50],
          ['Backup', 'h2', 'VM', 'Linux', 46203, 200, 2000, 20],
          // day 2026-07-01 — blank-capacity row (presence-gated) + below-floor row
          ['Backup', 'h1', 'Filesystem', 'Windows Server 2019', 46204, '', '', 80],
          ['Backup', 'h3', 'VM', 'Linux', 46204, 0.5, 10, 1], // terrible throughput but < 1 GiB floor
          // day 2026-07-02
          ['Backup', 'h2', 'VM', 'Linux', 46205, 50, 500, 15],
          // Restore row — must be excluded entirely (Job Type filter)
          ['Restore', 'h4', 'VM', 'Windows Server 2019', 46203, 999, 9999, 5],
        ],
      }),
    )

    // byType
    const vm = a.byType.find((t) => t.type === 'VM')
    expect(vm).toMatchObject({ capacityGb: 350.5, clients: 3, files: 3510 })
    const fs = a.byType.find((t) => t.type === 'Filesystem')
    expect(fs).toMatchObject({ capacityGb: 0, clients: 1, files: 0 })

    // largest — ranked by sizeGb descending, blank-capacity row never a candidate
    expect(a.largest.items.map((b) => ({ host: b.host, sizeGb: b.sizeGb }))).toEqual([
      { host: 'h2', sizeGb: 200 },
      { host: 'h1', sizeGb: 100 },
      { host: 'h2', sizeGb: 50 },
      { host: 'h3', sizeGb: 0.5 },
    ])

    // slowest — the 0.5 GiB / terrible-throughput row is floored out despite being the worst
    expect(a.slowest.items.some((s) => s.host === 'h3')).toBe(false)
    expect(
      a.slowest.items.map((s) => ({ host: s.host, throughputMbSec: s.throughputMbSec })),
    ).toEqual([
      { host: 'h2', throughputMbSec: 15 },
      { host: 'h2', throughputMbSec: 20 },
      { host: 'h1', throughputMbSec: 50 },
    ])

    // daily sums — Restore row excluded, blank capacity contributes 0 GB but still counts as a job
    expect(a.daily).toEqual([
      { day: '2026-06-30', gb: 300, jobs: 2 },
      { day: '2026-07-01', gb: 0.5, jobs: 2 },
      { day: '2026-07-02', gb: 50, jobs: 1 },
    ])

    // osSplit — distinct hosts per OS family; Restore row's host never counted
    expect(a.osSplit).toEqual({ counts: { Windows: 1, Linux: 2, Other: 0 } })
  })

  it('is empty for a Details-only workbook with no Job List Detailed sheet', () => {
    const a = avamarActivity(
      wb({
        Details: [
          ['Key', 'Value'],
          ['Product', 'Avamar'],
        ],
      }),
    )
    expect(a.byType).toEqual([])
    expect(a.daily).toEqual([])
    expect(a.largest.items).toEqual([])
    expect(a.slowest.items).toEqual([])
    expect(a.osSplit).toBeUndefined()
  })
})
