import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { networkerActivity } from './activity'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

const BACKUPS_HEADER = [
  'Client Name',
  'Backup Type',
  'Backup Size (GB)',
  'Number of Files',
  'Backup Created',
]
const CLIENTS_HEADER = ['Hostname', 'Client OS Type']

describe('networkerActivity', () => {
  it('derives byType/largest/daily from Backups alone, and osSplit from Clients', () => {
    const a = networkerActivity(
      wb({
        Backups: [
          BACKUPS_HEADER,
          // day 2026-06-30
          ['h1', 'Filesystem', 100, 1000, 46203.1],
          ['h2', 'Filesystem', 200, 2000, 46203.2],
          // blank size — presence-gated, still counts a client + file total
          ['h1', 'Oracle', '', '', 46203.3],
          // day 2026-07-01
          ['h3', 'Filesystem', 0.5, 10, 46204.4],
        ],
        Clients: [
          CLIENTS_HEADER,
          ['h1', 'Windows'],
          ['h2', 'Linux'],
          ['h3', 'Linux'],
          // duplicate hostname — must not be double-counted
          ['h1', 'Windows'],
        ],
      }),
    )

    // byType — from Backups rows only
    const fs = a.byType.find((t) => t.type === 'Filesystem')
    expect(fs).toMatchObject({ capacityGb: 300.5, clients: 3, files: 3010 })
    const oracle = a.byType.find((t) => t.type === 'Oracle')
    expect(oracle).toMatchObject({ capacityGb: 0, clients: 1, files: 0 })

    // largest — ranked by sizeGb descending. Blank-size Backups row never a candidate.
    expect(a.largest.items.map((b) => ({ host: b.host, type: b.type, sizeGb: b.sizeGb }))).toEqual([
      { host: 'h2', type: 'Filesystem', sizeGb: 200 },
      { host: 'h1', type: 'Filesystem', sizeGb: 100 },
      { host: 'h3', type: 'Filesystem', sizeGb: 0.5 },
    ])
    // A backup present once in the fixture appears exactly once in `largest`.
    expect(a.largest.items.filter((b) => b.host === 'h1' && b.sizeGb === 100)).toHaveLength(1)

    // daily — "backups per day" from Backup Created serials
    expect(a.daily).toEqual([
      { day: '2026-06-30', gb: 300, jobs: 3 },
      { day: '2026-07-01', gb: 0.5, jobs: 1 },
    ])

    // slowest — no sheet carries throughput, always empty
    expect(a.slowest.items).toEqual([])
    expect(a.slowest.total).toBe(0)

    // osSplit — from Clients, distinct by Hostname
    expect(a.osSplit).toEqual({ counts: { Windows: 1, Linux: 2, Other: 0 } })
  })

  it('is empty for a Details-only workbook with no Backups/Clients sheets', () => {
    const a = networkerActivity(
      wb({
        Details: [
          ['Key', 'Value'],
          ['Product', 'NetWorker'],
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
