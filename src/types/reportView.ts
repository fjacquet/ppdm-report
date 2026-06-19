import type { CaptureMeta } from './ppdm'

export type MetricKey = 'coverageByType' | 'gapsList' | 'compliance' | 'storageTargets'

/** Availability of a detail-only metric across the servers in scope. */
export interface MetricProvenance {
  available: boolean
  serversCovered: number
  serversTotal: number
  /** Asset-level coverage for the compliance metric only; omitted elsewhere. */
  assetsCovered?: number
  assetsTotal?: number
}

/** Protection counts + both coverage figures for one scope (a type, or the whole estate). */
export interface CoverageBand {
  protected: number
  unprotected: number
  excluded: number
  /** PROTECTED / (PROTECTED + UNPROTECTED); 0 when denominator is 0. */
  pct: number
  /** PROTECTED / (PROTECTED + UNPROTECTED + EXCLUDED); 0 when denominator is 0. */
  pctInclExcluded: number
}

export interface Coverage {
  byType: Record<string, CoverageBand>
  overall: CoverageBand
}

/** A capped "top N of total" list. */
export interface TopList<T> {
  items: T[]
  total: number
  shown: number
}

export interface UnprotectedAsset {
  name: string
  type: string
  sizeGb: number
}

export interface Gaps {
  count: number
  totalCapacityGb: number
  top: TopList<UnprotectedAsset>
}

export interface Jobs {
  counts: Record<string, number>
  total: number
  successPct: number
  capped: boolean
  windowSize: number
}

export interface Compliance {
  appConsistentPct: number
  immutablePct: number
  replicatedPct: number
  appConsistentCount: number
  immutableCount: number
  replicatedCount: number
  backupLevelMix: Record<string, number>
  windowSize: number
  capped: boolean
}

export interface StorageTarget {
  name: string
  type: string
  utilizationPct: number
  flagged: boolean
}

export interface Capacity {
  targets: StorageTarget[]
  flagged: StorageTarget[]
  mtreeCount: number
}

export interface PolicyRow {
  name: string
  purpose: string
  assetCount: number
  protectionCapacityGb: number
}

export interface Policies {
  count: number
  byPurpose: Record<string, number>
  perPolicy: PolicyRow[]
}

/** The single derived view of the whole report. Recomputed, never stored. */
export interface ReportView {
  meta: CaptureMeta
  inUse: string[]
  idleAgents: string[]
  warnings: string[]
  coverage: Coverage
  gaps: Gaps
  jobs: Jobs
  compliance: Compliance
  capacity: Capacity
  policies: Policies
  provenance: Record<MetricKey, MetricProvenance>
}

/** One source server's report plus identity, for the per-server breakdown. */
export interface ServerView {
  label: string
  /** PowerProtect version from System Information; '' when absent. */
  version: string
  view: ReportView
}

/** The whole estate: combined headline + per-server breakdown. */
export interface EstateView {
  combined: ReportView
  perServer: ServerView[]
  multiSource: boolean
}
