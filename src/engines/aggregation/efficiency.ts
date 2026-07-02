import { TOP_N_DEFAULT } from '../../types/ppdm'
import type { TopList } from '../../types/reportView'
import { topN } from './topN'

/** Numerator/denominator carried explicitly so estate merges fold exactly (never average averages). */
export interface WeightedRatio {
  num: number
  den: number
}

/** One dedupe observation: % Common (0..100) weighted by bytes processed. */
export interface DedupeSample {
  host: string
  commonPct: number
  weightBytes: number
}

export interface LowDedupeClient {
  host: string
  commonPct: number
  /** GiB processed in the window (weight, base-2). */
  processedGb: number
}

export interface Dedupe {
  /** Capacity-weighted % Common: num = Σ(pct×weight), den = Σweight. Avamar. */
  common?: WeightedRatio
  lowDedupe: TopList<LowDedupeClient>
  /** Data Domain logical vs physical used capacity (GB). NetWorker. */
  global?: { logicalGb: number; usedGb: number }
  /** Job-level data-reduction ratio weighted by capacity. NetWorker. */
  jobRatio?: WeightedRatio
}

/** Raw byte sums; the daily-change percentage is derived at render (sent / processed). */
export interface ChangeRate {
  sentBytes: number
  processedBytes: number
}

export const RETENTION_BUCKET_IDS = ['r30', 'r60', 'r180', 'r1y', 'r7y', 'r7yPlus'] as const
export type RetentionBucketId = (typeof RETENTION_BUCKET_IDS)[number]

export interface RetentionPolicyRow {
  type: string
  gbByBucket: Record<RetentionBucketId, number>
}

export interface RetentionProfile {
  totalGbByBucket: Record<RetentionBucketId, number>
  /** Per-policy-type split (Avamar); empty when the product only exposes totals. */
  perPolicyType: RetentionPolicyRow[]
}

export interface EncryptionCoverage {
  encryptedJobs: number
  totalJobs: number
  encryptedGb: number
  totalGb: number
}

export const REPLICATION_OUTCOME_IDS = [
  'success',
  'exceptions',
  'partial',
  'cancelled',
  'failed',
] as const
export type ReplicationOutcomeId = (typeof REPLICATION_OUTCOME_IDS)[number]

export interface ReplicationHealth {
  counts: Record<ReplicationOutcomeId, number>
  total: number
}

/** All sub-metrics optional; absent = not computable for that product/workbook. */
export interface Efficiency {
  dedupe?: Dedupe
  changeRate?: ChangeRate
  retention?: RetentionProfile
  encryption?: EncryptionCoverage
  replicationHealth?: ReplicationHealth
}

export function emptyEfficiency(): Efficiency {
  return {}
}

export function emptyRetentionBuckets(): Record<RetentionBucketId, number> {
  return { r30: 0, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 }
}

/** Flag clients whose weighted % Common falls below this. */
const LOW_DEDUPE_PCT = 50
/** Ignore clients with less than 1 GiB processed — % Common is noise at that size. */
const LOW_DEDUPE_MIN_BYTES = 2 ** 30

/** Capacity-weighted dedupe commonality + low-dedupe client list. Pure. */
export function computeDedupeCommon(samples: DedupeSample[]): {
  common?: WeightedRatio
  lowDedupe: TopList<LowDedupeClient>
} {
  let num = 0
  let den = 0
  const byHost = new Map<string, WeightedRatio>()
  for (const s of samples) {
    if (s.weightBytes <= 0) continue
    num += s.commonPct * s.weightBytes
    den += s.weightBytes
    if (!s.host) continue
    const h = byHost.get(s.host) ?? { num: 0, den: 0 }
    h.num += s.commonPct * s.weightBytes
    h.den += s.weightBytes
    byHost.set(s.host, h)
  }
  const low: LowDedupeClient[] = [...byHost.entries()]
    .filter(([, r]) => r.den >= LOW_DEDUPE_MIN_BYTES && r.num / r.den < LOW_DEDUPE_PCT)
    .map(([host, r]) => ({
      host,
      commonPct: r.num / r.den,
      processedGb: r.den / 2 ** 30,
    }))
  return {
    common: den > 0 ? { num, den } : undefined,
    // lowest commonality first (most interesting offenders)
    lowDedupe: topN(low, TOP_N_DEFAULT, (c) => -c.commonPct),
  }
}

/** Map an Avamar replication activity status onto a stable outcome bucket. */
export function classifyReplicationStatus(status: string): ReplicationOutcomeId {
  const s = status.toLowerCase()
  if (s === 'activity completed successfully.') return 'success'
  if (s.includes('exception')) return 'exceptions'
  if (s.startsWith('partially completed')) return 'partial'
  if (s.includes('cancel')) return 'cancelled'
  return 'failed'
}

/** Sum status counts per outcome. Undefined when there are no rows. Pure. */
export function computeReplicationHealth(
  rows: { status: string; count: number }[],
): ReplicationHealth | undefined {
  if (rows.length === 0) return undefined
  const counts: Record<ReplicationOutcomeId, number> = {
    success: 0,
    exceptions: 0,
    partial: 0,
    cancelled: 0,
    failed: 0,
  }
  let total = 0
  for (const r of rows) {
    if (r.count <= 0) continue
    counts[classifyReplicationStatus(r.status)] += r.count
    total += r.count
  }
  return { counts, total }
}
