import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarCapacityTrend } from './capacityTrend'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('avamarCapacityTrend + utilizationScaleFactor', () => {
  it('percent-scale sheet (values > 1) is used as-is', () => {
    const r = avamarCapacityTrend(
      wb({
        Details: [['Project Name', 'GERTRI01']],
        'Node Utilization': [
          ['Date', 'Node', 'Max Utilization (%)'],
          [45839, 0, 5.85],
          [45840, 0, 10.62],
        ],
      }),
    )
    expect(r.targets[0]?.target).toBe('GERTRI01 / node 0')
    expect(r.targets[0]?.currentPct).toBeCloseTo(10.62, 6)
  })

  it('ratio-scale sheet (all values ≤ 1) is multiplied by 100', () => {
    const r = avamarCapacityTrend(
      wb({
        'Node Utilization': [
          ['Date', 'Node', 'Max Utilization (%)'],
          [45839, 0, 0.9],
          [45840, 0, 0.92],
        ],
      }),
    )
    expect(r.targets[0]?.currentPct).toBeCloseTo(92, 6)
  })
})
