import { describe, expect, it } from 'vitest'
import { bucketWeekly, isoWeekStart } from './weeklyBucket'

describe('isoWeekStart', () => {
  it('maps a Wednesday to its Monday', () => {
    // 2026-06-17 is a Wednesday
    expect(isoWeekStart('2026-06-17')).toBe('2026-06-15')
  })

  it('maps a Monday to itself', () => {
    expect(isoWeekStart('2026-06-15')).toBe('2026-06-15')
  })

  it('maps a Sunday to the prior Monday', () => {
    // 2026-06-21 is a Sunday
    expect(isoWeekStart('2026-06-21')).toBe('2026-06-15')
  })

  it('handles a year boundary correctly', () => {
    // 2026-01-01 is a Thursday; its Monday falls in the prior year (2025-12-29)
    expect(isoWeekStart('2026-01-01')).toBe('2025-12-29')
  })

  it('passes through malformed input unchanged', () => {
    expect(isoWeekStart('not-a-date')).toBe('not-a-date')
    expect(isoWeekStart('')).toBe('')
  })
})

describe('bucketWeekly', () => {
  it('sums gb/jobs within the same ISO week', () => {
    const daily = [
      { day: '2026-06-15', gb: 10, jobs: 2 },
      { day: '2026-06-17', gb: 5, jobs: 1 },
      { day: '2026-06-21', gb: 3, jobs: 1 },
    ]
    const buckets = bucketWeekly(daily, 8)
    expect(buckets).toEqual([{ day: '2026-06-15', gb: 18, jobs: 4 }])
  })

  it('spans a year boundary across two weekly buckets', () => {
    const daily = [
      { day: '2025-12-30', gb: 4, jobs: 1 }, // week of 2025-12-29
      { day: '2026-01-02', gb: 6, jobs: 2 }, // week of 2025-12-29 (Thu Jan 1 falls in the same week)
      { day: '2026-01-05', gb: 7, jobs: 3 }, // week of 2026-01-05
    ]
    const buckets = bucketWeekly(daily, 8)
    expect(buckets).toEqual([
      { day: '2025-12-29', gb: 10, jobs: 3 },
      { day: '2026-01-05', gb: 7, jobs: 3 },
    ])
  })

  it('keeps only the last N buckets, in chronological order', () => {
    // 10 distinct weekly Mondays, each with one gb/job
    const weeks = [
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
      '2026-03-02',
      '2026-03-09',
    ]
    const points = weeks.map((day) => ({ day, gb: 1, jobs: 1 }))
    const buckets = bucketWeekly(points, 8)
    expect(buckets).toHaveLength(8)
    expect(buckets[0]?.day).toBe('2026-01-19')
    expect(buckets[7]?.day).toBe('2026-03-09')
  })

  it('ignores rows with an empty day', () => {
    const buckets = bucketWeekly([{ day: '', gb: 5, jobs: 1 }], 8)
    expect(buckets).toEqual([])
  })

  it('returns an empty array for no input', () => {
    expect(bucketWeekly([], 8)).toEqual([])
  })
})
