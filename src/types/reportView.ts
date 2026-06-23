import type { CaptureMeta, ProductId } from './ppdm'

export type MetricKey = 'coverageByType' | 'gapsList' | 'compliance' | 'storageTargets' | 'frontEnd'

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
  sizeGb?: number
}

export interface Gaps {
  count: number
  totalCapacityGb?: number
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
  usedGb?: number
  totalGb?: number
  freeGb?: number
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

/** Front-end volume for one workload type. Size fields are tri-state: a number ≥ 0 = measured;
 * undefined = "no figure" (column absent or assets present but sums to 0) → renders "–". */
export interface FrontEndTypeRow {
  type: string
  protectedDiscoveredGb?: number
  protectedFetbGb?: number
  unprotectedDiscoveredGb?: number
  unprotectedFetbGb?: number
}

/** Per-type front-end volumetry for one scope. Totals are derived at render, never stored. */
export interface FrontEnd {
  byType: FrontEndTypeRow[]
  /** EXCLUDED assets across in-use types — footnote only, never in totals. */
  excludedCount: number
}

/** One agent/client-software version and how many clients run it. */
export interface AgentVersionRow {
  version: string
  count: number
}

/** A client flagged as at-risk (window breach or stale backup). */
export interface AtRiskClient {
  name: string
  clientType?: string
}

/** Two distinct at-risk populations. */
export interface AtRiskClients {
  /** Clients breaching their backup window. */
  overtime: TopList<AtRiskClient>
  /** Clients with no backup in the last 7 days. */
  staleBackups: TopList<AtRiskClient>
}

/** One long-running backup job. */
export interface LongBackupRow {
  server: string
  policyType: string
  durationHr: number
  capacityGb?: number
  throughputMbSec?: number
}

/** Cross-product operational insights. Populated by Avamar today; empty elsewhere. */
export interface OpsInsights {
  agentVersions: AgentVersionRow[]
  atRisk: AtRiskClients
  longestBackups: TopList<LongBackupRow>
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
  frontEnd: FrontEnd
  opsInsights: OpsInsights
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

/** One product's estate within a multi-product document. */
export interface ProductEstate {
  product: ProductId
  estate: EstateView
}

/** The whole loaded set: one estate section per product. No cross-product totals. */
export interface EstateDocument {
  products: ProductEstate[]
  multiProduct: boolean
}
