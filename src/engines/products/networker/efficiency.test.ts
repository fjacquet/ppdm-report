import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { networkerEfficiency } from './efficiency'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('networkerEfficiency', () => {
  it('global dedupe from Data Domains logical vs used; job ratio weighted and garbage-guarded', () => {
    const e = networkerEfficiency(
      wb({
        'Data Domains': [
          ['Name', 'Used Capacity (GB)', 'Used Logical Capacity (GB)'],
          ['dd1', 555000, 13000000],
          ['dd2', '', ''], // blank — never enters sums
        ],
        'Dedup Jobs': [
          ['Hostname', 'Data Reduction Ratio', 'Capacity (GB)'],
          ['c1', 20, 100],
          ['c2', 10, 50],
          ['lab-garbage', 0.195, 0.000000408], // ratio ok but capacity ~0 → negligible weight
          ['bad', -3, 10], // non-positive ratio — skipped
        ],
      }),
    )
    expect(e.dedupe?.global).toEqual({ logicalGb: 13000000, usedGb: 555000 })
    // (20×100 + 10×50) / 150 ≈ 16.67 — garbage row's weight is ~0
    expect(e.dedupe?.jobRatio && e.dedupe.jobRatio.num / e.dedupe.jobRatio.den).toBeCloseTo(
      16.67,
      1,
    )
  })

  it('retention profile from KPI raw sums (TB → GB, base-10)', () => {
    const e = networkerEfficiency(
      wb({
        KPIs: [
          ['Metric', 'Value'],
          ['Total Capacity with Retention < 30 Days (TB)', 0],
          ['Total Capacity with Retention < 60 Days (TB)', 0.0294],
          ['Total Capacity with Retention < 180 Days (TB)', 0],
          ['Total Capacity with Retention < 365 Days (TB)', 0],
          ['Total Capacity with Retention < 7 Years (TB)', 0.0003],
          ['Total Capacity with Retention >= 7 Years (TB)', 0],
          ['Backup Success Percentage', 100], // a RATE — must be ignored
        ],
      }),
    )
    expect(e.retention?.totalGbByBucket.r60).toBeCloseTo(29.4, 3)
    expect(e.retention?.totalGbByBucket.r7y).toBeCloseTo(0.3, 3)
    expect(e.retention?.perPolicyType).toEqual([])
  })

  it('no sheets → empty Efficiency; encryption/changeRate/replicationHealth never set', () => {
    const e = networkerEfficiency(wb({ Details: [['Project Name', 'x']] }))
    expect(Object.values(e).every((v) => v === undefined)).toBe(true)
  })
})
