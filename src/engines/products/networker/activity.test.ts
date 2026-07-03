import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { networkerActivity } from './activity'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

const BACKUPS_HEADER = ['Client Name', 'Backup Type', 'Backup Size (GB)', 'Number of Files']
const JOBS_HEADER = ['Job Type', 'Client Name', 'Start Time', 'Size (GB)']
const CLIENTS_HEADER = ['Hostname', 'Client OS Type']

describe('networkerActivity', () => {
  it('derives byType/largest from Backups, daily from Jobs, and osSplit from Clients', () => {
    const a = networkerActivity(
      wb({
        Backups: [
          BACKUPS_HEADER,
          ['h1', 'Filesystem', 100, 1000],
          ['h2', 'Filesystem', 200, 2000],
          // blank size — presence-gated, still counts a client + file total
          ['h1', 'Oracle', '', ''],
          ['h3', 'Filesystem', 0.5, 10],
        ],
        Jobs: [
          JOBS_HEADER,
          // day 2026-06-30 — two backup-carrying jobs
          ['save', 'h1', 46203, 50],
          ['backup', 'h2', 46203, 30],
          // day 2026-07-01
          ['vproxysave', 'h3', 46204, 20],
          // utility row — excluded by the /save|backup/i job-type filter
          ['workflow', 'h4', 46204, 999],
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

    // byType — from Backups rows only (Jobs rows carry blank type, ignored here)
    const fs = a.byType.find((t) => t.type === 'Filesystem')
    expect(fs).toMatchObject({ capacityGb: 300.5, clients: 3, files: 3010 })
    const oracle = a.byType.find((t) => t.type === 'Oracle')
    expect(oracle).toMatchObject({ capacityGb: 0, clients: 1, files: 0 })

    // largest — ranked by sizeGb descending; largest isn't type-gated, so both sources
    // contribute (Backups rows carry their Backup Type, Jobs rows carry blank type).
    // Blank-size Backups row never a candidate.
    expect(a.largest.items.map((b) => ({ host: b.host, type: b.type, sizeGb: b.sizeGb }))).toEqual([
      { host: 'h2', type: 'Filesystem', sizeGb: 200 },
      { host: 'h1', type: 'Filesystem', sizeGb: 100 },
      { host: 'h1', type: '', sizeGb: 50 },
      { host: 'h2', type: '', sizeGb: 30 },
      { host: 'h3', type: '', sizeGb: 20 },
      { host: 'h3', type: 'Filesystem', sizeGb: 0.5 },
    ])

    // daily — from Jobs rows only, utility job excluded, size still gated per row
    expect(a.daily).toEqual([
      { day: '2026-06-30', gb: 80, jobs: 2 },
      { day: '2026-07-01', gb: 20, jobs: 1 },
    ])

    // slowest — no sheet carries throughput, always empty
    expect(a.slowest.items).toEqual([])
    expect(a.slowest.total).toBe(0)

    // osSplit — from Clients, distinct by Hostname
    expect(a.osSplit).toEqual({ counts: { Windows: 1, Linux: 2, Other: 0 } })
  })

  it('is empty for a Details-only workbook with no Backups/Jobs/Clients sheets', () => {
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
