import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarPolicies } from './policies'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('avamarPolicies', () => {
  it('distinct Group Name from Job List Detailed with per-group hosts + capacity', () => {
    const p = avamarPolicies(
      wb({
        'Job List Detailed': [
          ['Host', 'Group Name', 'Capacity (GiB)'],
          ['h1', 'G1', 10],
          ['h2', 'G1', 20],
          ['h3', 'G2', 5],
        ],
      }),
    )
    expect(p.count).toBe(2)
    expect(p.byPurpose).toEqual({})
    expect(p.perPolicy).toContainEqual({
      name: 'G1',
      purpose: '',
      assetCount: 2,
      protectionCapacityGb: 30,
    })
    expect(p.perPolicy).toContainEqual({
      name: 'G2',
      purpose: '',
      assetCount: 1,
      protectionCapacityGb: 5,
    })
  })

  it('falls back to Group Summary distinct Group Name', () => {
    const p = avamarPolicies(
      wb({
        'Group Summary': [['Group Name'], ['G1'], ['G1'], ['G2']],
      }),
    )
    expect(p.count).toBe(2)
    expect(p.perPolicy).toEqual([])
  })
})
