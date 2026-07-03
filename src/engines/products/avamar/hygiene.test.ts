import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarHygiene } from './hygiene'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('avamarHygiene', () => {
  it('collects findings from all five sheets, counts per kind, cleanupTotal excludes overtime', () => {
    const h = avamarHygiene(
      wb({
        'Dataset Not In Use': [
          ['Domain', 'Name'],
          ['/', 'ds1'],
          ['/dc1', 'ds2'],
        ],
        'Retention Not In Use': [
          ['Domain', 'Name'],
          ['/', 'ret1'],
        ],
        'Schedule Not In Use': [
          ['Domain', 'Name'],
          ['/dc2', 'sch1'],
        ],
        'Inactive Clients': [
          ['Full Domain', 'Client Type'],
          ['/clients/a', 'REGULAR'],
        ],
        'Overtime Clients': [
          ['Full Domain Name', 'Client Type'],
          ['/clients/b', 'VREGULAR'],
        ],
      }),
    )

    expect(h.countByKind).toEqual({
      datasetUnused: 2,
      retentionUnused: 1,
      scheduleUnused: 1,
      clientInactive: 1,
      clientOvertime: 1,
      license: 0,
    })
    // cleanupTotal = datasetUnused + retentionUnused + scheduleUnused + clientInactive (excludes overtime)
    expect(h.cleanupTotal).toBe(5)
    expect(h.items).toHaveLength(6)

    // '/' domain → no detail; a real domain → detail present
    expect(h.items).toContainEqual({ kind: 'datasetUnused', name: 'ds1', detail: undefined })
    expect(h.items).toContainEqual({ kind: 'datasetUnused', name: 'ds2', detail: '/dc1' })
    expect(h.items).toContainEqual({ kind: 'retentionUnused', name: 'ret1', detail: undefined })
    expect(h.items).toContainEqual({ kind: 'scheduleUnused', name: 'sch1', detail: '/dc2' })
    expect(h.items).toContainEqual({
      kind: 'clientInactive',
      name: '/clients/a',
      detail: 'REGULAR',
    })
    expect(h.items).toContainEqual({
      kind: 'clientOvertime',
      name: '/clients/b',
      detail: 'VREGULAR',
    })
  })

  it('single-cell "no data" sheets yield zero items', () => {
    const noData = [['The query executed did not return any data.']]
    const h = avamarHygiene(
      wb({
        'Dataset Not In Use': noData,
        'Retention Not In Use': noData,
        'Schedule Not In Use': noData,
        'Inactive Clients': noData,
        'Overtime Clients': noData,
      }),
    )
    expect(h.items).toEqual([])
    expect(h.cleanupTotal).toBe(0)
  })

  it('missing sheets entirely (Details-only workbook) yield zero items', () => {
    const h = avamarHygiene(
      wb({
        Details: [
          ['Project Name', 'AVA-empty'],
          ['Date', 45000],
        ],
      }),
    )
    expect(h.items).toEqual([])
    expect(h.cleanupTotal).toBe(0)
  })
})
