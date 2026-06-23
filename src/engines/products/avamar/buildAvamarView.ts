import { FLAG_THRESHOLD_PCT, type RawWorkbook, TOP_N_DEFAULT } from '../../../types/ppdm'
import type { ReportView, StorageTarget, UnprotectedAsset } from '../../../types/reportView'
import { emptyBand, finalizeBand } from '../../aggregation/coverage'
import { emptyFrontEnd } from '../../aggregation/frontEnd'
import { avamarProvenance } from '../../aggregation/provenance'
import { cellNum, cellStr } from '../../aggregation/rows'

/** Sum the `Total` column over rows whose `Has Backups` equals `flag`. */
function hasBackupsCount(wb: RawWorkbook, sheet: string, flag: 'True' | 'False'): number {
  const rows = wb.sheets[sheet]?.rows ?? []
  return rows
    .filter((r) => cellStr(r, 'Has Backups') === flag)
    .reduce((acc, r) => acc + cellNum(r, 'Total'), 0)
}

/** Sum the `Total` column over every row of a sheet. */
function sumTotal(wb: RawWorkbook, sheet: string): number {
  return (wb.sheets[sheet]?.rows ?? []).reduce((acc, r) => acc + cellNum(r, 'Total'), 0)
}

/** Latest-date Max Utilization (%) per node → storage targets. */
function nodeTargets(wb: RawWorkbook): StorageTarget[] {
  const rows = wb.sheets['Node Utilization']?.rows ?? []
  const latest = new Map<string, { date: number; util: number }>()
  for (const r of rows) {
    const node = cellStr(r, 'Node')
    const date = cellNum(r, 'Date')
    // Raw column is a 0..1 ratio (e.g. 0.92 = 92%); multiply by 100 to get pct scale.
    const util = cellNum(r, 'Max Utilization (%)') * 100
    const prev = latest.get(node)
    if (!prev || date >= prev.date) latest.set(node, { date, util })
  }
  return [...latest.entries()].map(([node, { util }]) => ({
    name: `Avamar node ${node}`,
    type: 'Avamar grid node',
    utilizationPct: util,
    flagged: util >= FLAG_THRESHOLD_PCT,
  }))
}

/** Disabled-group names, disambiguated by domain when the domain is not the root '/'. */
function disabledGroups(wb: RawWorkbook): string[] {
  const rows = wb.sheets['Disabled Groups']?.rows ?? []
  return rows.map((r) => {
    const name = cellStr(r, 'Name')
    const domain = cellStr(r, 'Domain')
    return domain && domain !== '/' ? `${name} (${domain})` : name
  })
}

/** Avamar composition root: RawWorkbook → ReportView. Pure. MVP fidelity (see plan). */
export function buildAvamarView(wb: RawWorkbook): ReportView {
  // coverage — count-based; retired clients → excluded band; no per-type breakdown.
  const protectedN = hasBackupsCount(wb, 'NonRetired Clients With Backups', 'True')
  const unprotectedN = hasBackupsCount(wb, 'NonRetired Clients With Backups', 'False')
  const excluded = sumTotal(wb, 'Retired Clients With Backups')
  const overall = finalizeBand({
    ...emptyBand(),
    protected: protectedN,
    unprotected: unprotectedN,
    excluded,
  })

  // jobs — Avamar-native buckets; success excludes Exception + Failed.
  const bcs = wb.sheets['Backup Completion Summary']?.rows[0]
  const success = cellNum(bcs ?? {}, 'Successful')
  const exception = cellNum(bcs ?? {}, 'Exception')
  const failed = cellNum(bcs ?? {}, 'Failed')
  const jobsTotal = cellNum(bcs ?? {}, 'Total')
  const counts: Record<string, number> = { SUCCESS: success, EXCEPTION: exception, FAILED: failed }

  // gaps — unprotected-client list, no per-asset size.
  const noBackupRows = wb.sheets['Clients No Backups']?.rows ?? []
  const gapItems: UnprotectedAsset[] = noBackupRows.map((r) => ({
    name: cellStr(r, 'Full Domain'),
    type: cellStr(r, 'Client Type'),
    sizeGb: undefined,
  }))
  const gapTop = gapItems.slice(0, TOP_N_DEFAULT)

  // workload types in use — plugins with a positive count.
  const inUse = (wb.sheets['Backup Plugins']?.rows ?? [])
    .filter((r) => cellNum(r, 'Count') > 0)
    .map((r) => cellStr(r, 'Plugin Name'))

  // policies — distinct protection-group count only.
  const groupNames = new Set(
    (wb.sheets['Group Summary']?.rows ?? []).map((r) => cellStr(r, 'Group Name')).filter(Boolean),
  )

  // compute node targets once to avoid double call
  const targets = nodeTargets(wb)

  return {
    meta: wb.meta,
    inUse,
    idleAgents: disabledGroups(wb),
    warnings: wb.warnings,
    coverage: { byType: {}, overall },
    gaps: {
      count: gapItems.length,
      totalCapacityGb: undefined,
      top: { items: gapTop, total: gapItems.length, shown: gapTop.length },
    },
    jobs: {
      counts,
      total: jobsTotal,
      successPct: jobsTotal > 0 ? success / jobsTotal : 0,
      capped: false,
      windowSize: jobsTotal,
    },
    compliance: {
      appConsistentPct: 0,
      immutablePct: 0,
      replicatedPct: 0,
      appConsistentCount: 0,
      immutableCount: 0,
      replicatedCount: 0,
      backupLevelMix: {},
      windowSize: 0,
      capped: false,
    },
    capacity: { targets, flagged: targets.filter((t) => t.flagged), mtreeCount: 0 },
    policies: { count: groupNames.size, byPurpose: {}, perPolicy: [] },
    frontEnd: emptyFrontEnd(),
    provenance: avamarProvenance(),
  }
}
