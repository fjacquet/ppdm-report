import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarEfficiency } from './efficiency'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

const GIB = 2 ** 30

describe('avamarEfficiency', () => {
  it('derives dedupe + change rate from DPN Summary backup rows only', () => {
    const e = avamarEfficiency(
      wb({
        'Avamar DPN Summary': [
          ['Host', 'Operation', '% Common', 'Bytes Processed', 'Bytes Mod And Sent'],
          ['h1', 'Scheduled Backup', 100, 9 * GIB, GIB],
          ['h2', 'On-Demand Backup', 20, 1 * GIB, GIB / 2],
          ['h3', 'Restore', 0, 100 * GIB, 100 * GIB], // non-backup — excluded
        ],
      }),
    )
    expect(e.dedupe?.common && e.dedupe.common.num / e.dedupe.common.den).toBeCloseTo(92, 6)
    expect(e.dedupe?.lowDedupe.items[0]?.host).toBe('h2')
    expect(e.changeRate).toEqual({ sentBytes: 1.5 * GIB, processedBytes: 10 * GIB })
  })

  it('maps Policy Capacity-Retention columns (numeric headers arrive as string keys)', () => {
    const e = avamarEfficiency(
      wb({
        'Policy Capacity-Retention': [
          ['Policy Type', 30, 60, 180, 360, '< 7yr', '> 7yr'],
          ['Windows SQL', 1039.53, 21.26, 0, 0, 0, 0],
          ['Hyper-V', 2212.05, 280.24, 0, 0, 0, 0],
        ],
      }),
    )
    expect(e.retention?.totalGbByBucket.r30).toBeCloseTo(3251.58, 2)
    expect(e.retention?.totalGbByBucket.r60).toBeCloseTo(301.5, 2)
    expect(e.retention?.perPolicyType).toHaveLength(2)
    expect(e.retention?.perPolicyType[0]?.type).toBe('Windows SQL')
  })

  it('encryption is undefined when the Encrypted column is blank everywhere (JTI reality)', () => {
    const e = avamarEfficiency(
      wb({
        'Job List Detailed': [
          ['Host', 'Job Type', 'Capacity (GiB)', 'Encrypted'],
          ['h1', 'Backup', 10, ''],
          ['h2', 'Backup', 20, ''],
        ],
      }),
    )
    expect(e.encryption).toBeUndefined()
  })

  it('computes encryption coverage when values are present', () => {
    const e = avamarEfficiency(
      wb({
        'Job List Detailed': [
          ['Host', 'Job Type', 'Capacity (GiB)', 'Encrypted'],
          ['h1', 'Backup', 10, 'true'],
          ['h2', 'Backup', 30, 'false'],
          ['h3', 'GC', 99, 'true'], // non-backup — excluded
        ],
      }),
    )
    expect(e.encryption).toEqual({ encryptedJobs: 1, totalJobs: 2, encryptedGb: 10, totalGb: 40 })
  })

  it('replication health from the completion-status sheet', () => {
    const e = avamarEfficiency(
      wb({
        'Replication (Completion Status)': [
          ['Status', 'Total'],
          ['Activity completed successfully.', 904611],
          ['Activity failed - client error(s).', 1111],
          ['Partially completed replication activity.', 7097],
        ],
      }),
    )
    expect(e.replicationHealth?.counts.failed).toBe(1111)
    expect(e.replicationHealth?.counts.partial).toBe(7097)
    expect(e.replicationHealth?.total).toBe(912819)
  })

  it('a workbook with none of the source sheets yields an empty Efficiency', () => {
    const e = avamarEfficiency(wb({ Details: [['Project Name', 'x']] }))
    expect(Object.values(e).every((v) => v === undefined)).toBe(true)
  })
})
