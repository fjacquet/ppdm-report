import { AGENT_SHEETS, TOP_N_DEFAULT } from '../../types/ppdm'
import type { CoverageBand, MetricKey, MetricProvenance, ReportView } from '../../types/reportView'
import { foldMeta } from '../parser/foldMeta'
import { emptyBand, finalizeBand } from './coverage'
import { topN } from './topN'

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

function addBand(acc: CoverageBand, b: CoverageBand): CoverageBand {
  acc.protected += b.protected
  acc.unprotected += b.unprotected
  acc.excluded += b.excluded
  return acc
}

function mergeCounts(dicts: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of dicts) for (const [k, n] of Object.entries(d)) out[k] = (out[k] ?? 0) + n
  return out
}

function mergeProvenance(views: ReportView[]): Record<MetricKey, MetricProvenance> {
  const keys: MetricKey[] = ['coverageByType', 'gapsList', 'compliance', 'storageTargets']
  const out = {} as Record<MetricKey, MetricProvenance>
  for (const key of keys) {
    const ps = views.map((v) => v.provenance[key])
    const serversCovered = ps.filter((p) => p.available).length
    const mp: MetricProvenance = {
      available: serversCovered > 0,
      serversCovered,
      serversTotal: views.length,
    }
    if (key === 'compliance') {
      mp.assetsCovered = sum(ps.map((p) => p.assetsCovered ?? 0))
      mp.assetsTotal = sum(ps.map((p) => p.assetsTotal ?? 0))
    }
    out[key] = mp
  }
  return out
}

/** Fold N per-server ReportViews into one estate ReportView. Pure. Identity on a single view. */
export function mergeViews(views: ReportView[]): ReportView {
  const first = views[0]
  if (!first) throw new Error('mergeViews requires at least one view')
  if (views.length === 1) return first

  // coverage
  const overall = views.reduce((acc, v) => addBand(acc, v.coverage.overall), emptyBand())
  const byType: Record<string, CoverageBand> = {}
  for (const v of views) {
    for (const [type, band] of Object.entries(v.coverage.byType)) {
      byType[type] = finalizeBand(addBand(byType[type] ?? emptyBand(), band))
    }
  }

  // jobs
  const jobCounts = mergeCounts(views.map((v) => v.jobs.counts))
  const jobsTotal = sum(views.map((v) => v.jobs.total))

  // compliance
  const appC = sum(views.map((v) => v.compliance.appConsistentCount))
  const imm = sum(views.map((v) => v.compliance.immutableCount))
  const rep = sum(views.map((v) => v.compliance.replicatedCount))
  const n = sum(views.map((v) => v.compliance.windowSize))

  // gaps (per-server top-N lists suffice for the global top-N)
  const gapItems = views.flatMap((v) => v.gaps.top.items)
  const gapTop = topN(gapItems, TOP_N_DEFAULT, (a) => a.sizeGb)
  const gapsCount = sum(views.map((v) => v.gaps.count))

  // capacity
  const targets = views.flatMap((v) => v.capacity.targets)

  return {
    meta: foldMeta(views.map((v) => v.meta)),
    inUse: AGENT_SHEETS.filter((a) => views.some((v) => v.inUse.includes(a))),
    idleAgents: AGENT_SHEETS.filter(
      (a) => !views.some((v) => v.inUse.includes(a)) && views.some((v) => v.idleAgents.includes(a)),
    ),
    warnings: [], // estate warnings are applied by the derivation layer (estateWarnings)
    coverage: { byType, overall: finalizeBand(overall) },
    gaps: {
      count: gapsCount,
      totalCapacityGb: sum(views.map((v) => v.gaps.totalCapacityGb)),
      top: { ...gapTop, total: gapsCount },
    },
    jobs: {
      counts: jobCounts,
      total: jobsTotal,
      successPct: jobsTotal > 0 ? (jobCounts.SUCCESS ?? 0) / jobsTotal : 0,
      capped: views.some((v) => v.jobs.capped),
      windowSize: jobsTotal,
    },
    compliance: {
      appConsistentPct: n > 0 ? appC / n : 0,
      immutablePct: n > 0 ? imm / n : 0,
      replicatedPct: n > 0 ? rep / n : 0,
      appConsistentCount: appC,
      immutableCount: imm,
      replicatedCount: rep,
      backupLevelMix: mergeCounts(views.map((v) => v.compliance.backupLevelMix)),
      windowSize: n,
      capped: views.some((v) => v.compliance.capped),
    },
    capacity: {
      targets,
      flagged: targets.filter((t) => t.flagged),
      mtreeCount: sum(views.map((v) => v.capacity.mtreeCount)),
    },
    policies: {
      count: sum(views.map((v) => v.policies.count)),
      byPurpose: mergeCounts(views.map((v) => v.policies.byPurpose)),
      perPolicy: views.flatMap((v) => v.policies.perPolicy),
    },
    provenance: mergeProvenance(views),
  }
}
