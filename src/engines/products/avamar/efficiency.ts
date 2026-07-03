import type { RawWorkbook } from '../../../types/ppdm'
import {
  computeDedupeCommon,
  computeReplicationHealth,
  type DedupeSample,
  type Efficiency,
  emptyRetentionBuckets,
  type RetentionBucketId,
  type RetentionPolicyRow,
} from '../../aggregation/efficiency'
import { cellNum, cellStr } from '../../aggregation/rows'
import { BACKUP_OPS } from './jobs'

/** Numeric xlsx headers (30, 60, …) arrive as string keys via readWorkbook's String(h).trim(). */
const RETENTION_COLUMNS: [string, RetentionBucketId][] = [
  ['30', 'r30'],
  ['60', 'r60'],
  ['180', 'r180'],
  ['360', 'r1y'],
  ['< 7yr', 'r7y'],
  ['> 7yr', 'r7yPlus'],
]

const ENCRYPTED_TRUE = /^(true|yes|1)$/i

/** Avamar efficiency: dedupe %Common + change rate (DPN Summary), retention profile
 * (Policy Capacity-Retention, GiB base-2), presence-gated encryption coverage
 * (Job List Detailed), replication health (Replication Completion Status). Pure. */
export function avamarEfficiency(wb: RawWorkbook): Efficiency {
  const out: Efficiency = {}

  // dedupe + change rate — backup operations only; blank cells never enter sums.
  const dpn = (wb.sheets['Avamar DPN Summary']?.rows ?? []).filter((r) =>
    BACKUP_OPS.has(cellStr(r, 'Operation')),
  )
  const samples: DedupeSample[] = []
  let sentBytes = 0
  let processedBytes = 0
  for (const r of dpn) {
    const processedStr = cellStr(r, 'Bytes Processed')
    if (processedStr === '') continue
    const processed = cellNum(r, 'Bytes Processed')
    if (cellStr(r, '% Common') !== '') {
      samples.push({
        host: cellStr(r, 'Host'),
        commonPct: cellNum(r, '% Common'),
        weightBytes: processed,
      })
    }
    // change-rate sums are pair-gated: both bytes cells must be present, or the
    // sent/processed ratio is deflated by a missing-coerced-to-0 numerator.
    const sentStr = cellStr(r, 'Bytes Mod And Sent')
    if (sentStr !== '') {
      sentBytes += cellNum(r, 'Bytes Mod And Sent')
      processedBytes += processed
    }
  }
  if (samples.length > 0) {
    const { common, lowDedupe } = computeDedupeCommon(samples)
    out.dedupe = { common, lowDedupe }
  }
  if (processedBytes > 0) out.changeRate = { sentBytes, processedBytes }

  // retention profile — GiB values straight off the sheet (base-2 formatting downstream).
  const retRows = wb.sheets['Policy Capacity-Retention']?.rows ?? []
  if (retRows.length > 0) {
    const total = emptyRetentionBuckets()
    const perPolicyType: RetentionPolicyRow[] = []
    for (const r of retRows) {
      const type = cellStr(r, 'Policy Type')
      if (!type) continue
      const gbByBucket = emptyRetentionBuckets()
      for (const [col, id] of RETENTION_COLUMNS) {
        if (cellStr(r, col) !== '') gbByBucket[id] = cellNum(r, col)
        total[id] += gbByBucket[id]
      }
      perPolicyType.push({ type, gbByBucket })
    }
    if (perPolicyType.length > 0) out.retention = { totalGbByBucket: total, perPolicyType }
  }

  // encryption — presence-gated: rows with a blank Encrypted cell carry no signal.
  const jl = (wb.sheets['Job List Detailed']?.rows ?? []).filter(
    (r) => cellStr(r, 'Job Type') === 'Backup' && cellStr(r, 'Encrypted') !== '',
  )
  if (jl.length > 0) {
    let encryptedJobs = 0
    let encryptedGb = 0
    let totalGb = 0
    for (const r of jl) {
      const encrypted = ENCRYPTED_TRUE.test(cellStr(r, 'Encrypted'))
      if (encrypted) encryptedJobs++
      if (cellStr(r, 'Capacity (GiB)') !== '') {
        const gb = cellNum(r, 'Capacity (GiB)')
        totalGb += gb
        if (encrypted) encryptedGb += gb
      }
    }
    out.encryption = { encryptedJobs, totalJobs: jl.length, encryptedGb, totalGb }
  }

  // replication health — aggregate status counts (raw sums, allowed).
  const rep = (wb.sheets['Replication (Completion Status)']?.rows ?? [])
    .map((r) => ({ status: cellStr(r, 'Status'), count: cellNum(r, 'Total') }))
    .filter((r) => r.status !== '')
  out.replicationHealth = computeReplicationHealth(rep)

  return out
}
