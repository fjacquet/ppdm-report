import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../test-helpers/workbooks'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { computeAvamarFrontEnd } from './frontEnd'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('computeAvamarFrontEnd', () => {
  it('sums Client Capacity Max Peak GiB per Application as protected discovered', () => {
    const fe = computeAvamarFrontEnd(
      wb({
        'Client Capacity': [
          ['Hostname', 'Application', 'Max Peak GiB'],
          ['h1', 'Linux VMware Image', 100],
          ['h2', 'Windows File System', 50],
          ['h3', 'Linux VMware Image', 25],
        ],
      }),
    )
    expect(fe.excludedCount).toBe(0)
    expect(fe.byType).toContainEqual({ type: 'Linux VMware Image', protectedDiscoveredGb: 125 })
    expect(fe.byType).toContainEqual({ type: 'Windows File System', protectedDiscoveredGb: 50 })
    // other three size fields are undefined ("–")
    const row = fe.byType.find((r) => r.type === 'Windows File System')
    expect(row?.protectedFetbGb).toBeUndefined()
    expect(row?.unprotectedDiscoveredGb).toBeUndefined()
  })

  it('empty when Client Capacity is absent', () => {
    expect(computeAvamarFrontEnd(wb({ Details: [['Project Name', 'x']] }))).toEqual({
      byType: [],
      excludedCount: 0,
    })
  })
})
