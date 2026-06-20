import { FLAG_THRESHOLD_PCT, type RawWorkbook, TOP_N_DEFAULT } from '../../../types/ppdm'
import type { ReportView, StorageTarget, UnprotectedAsset } from '../../../types/reportView'
import { emptyBand, finalizeBand } from '../../aggregation/coverage'
import { networkerProvenance } from '../../aggregation/provenance'
import { cellNum, cellStr, countBy } from '../../aggregation/rows'

const rowsOf = (wb: RawWorkbook, sheet: string) => wb.sheets[sheet]?.rows ?? []

/** True when a cell value is a real, present value (not empty or 'N/A'). */
function isPresent(value: string): boolean {
  const v = value.trim().toUpperCase()
  return v !== '' && v !== 'N/A'
}

/** Count of distinct present values of `key` across a sheet's rows. */
function distinctCount(wb: RawWorkbook, sheet: string, key: string): number {
  const set = new Set<string>()
  for (const r of rowsOf(wb, sheet)) {
    const v = cellStr(r, key)
    if (isPresent(v)) set.add(v)
  }
  return set.size
}

/** NetWorker composition root: RawWorkbook → ReportView. Pure. MVP fidelity (see plan). */
export function buildNetworkerView(wb: RawWorkbook): ReportView {
  // coverage — scheduled-backup flag; no per-type, no excluded.
  const clientRows = rowsOf(wb, 'Clients')
  const protectedN = clientRows.filter((r) => cellStr(r, 'Scheduled Backup') === 'True').length
  const overall = finalizeBand({
    ...emptyBand(),
    protected: protectedN,
    unprotected: clientRows.length - protectedN,
    excluded: 0,
  })

  // jobs — Completion Status distribution; NetWorker-native bucket 'Succeeded'.
  const jobRows = rowsOf(wb, 'Jobs')
  const counts = countBy(jobRows, 'Completion Status')
  const jobsTotal = jobRows.length

  // gaps — unprotected clients (no scheduled backup), no per-asset size.
  const gapItems: UnprotectedAsset[] = clientRows
    .filter((r) => cellStr(r, 'Scheduled Backup') !== 'True')
    .map((r) => ({
      name: cellStr(r, 'Hostname'),
      type: cellStr(r, 'Backup Type'),
      sizeGb: undefined,
    }))
  const gapTop = gapItems.slice(0, TOP_N_DEFAULT)

  // capacity — real Data Domain utilization (Used / Total).
  const targets: StorageTarget[] = rowsOf(wb, 'Data Domains').map((r) => {
    const used = cellNum(r, 'Used Capacity (GB)')
    const total = cellNum(r, 'Total Capacity (GB)')
    const utilizationPct = total > 0 ? (used / total) * 100 : 0
    return {
      name: cellStr(r, 'Name'),
      type: cellStr(r, 'Model'),
      utilizationPct,
      flagged: utilizationPct >= FLAG_THRESHOLD_PCT,
    }
  })

  // workload types — present-with-capacity vs present-but-empty (mirrors PPDM agent split).
  const workloadRows = rowsOf(wb, 'Front End Capacity by Workload')
  const inUse = workloadRows
    .filter((r) => cellNum(r, 'Front End Capacity (GB)') > 0)
    .map((r) => cellStr(r, 'Workload Type'))
  const idleAgents = workloadRows
    .filter((r) => cellNum(r, 'Front End Capacity (GB)') === 0)
    .map((r) => cellStr(r, 'Workload Type'))

  // policies — distinct protection-policy count.
  const policyNames = new Set(
    rowsOf(wb, 'Policies')
      .map((r) => cellStr(r, 'Policy Name'))
      .filter(Boolean),
  )

  // compliance — computed from the signals NetWorker exposes (app-consistency is N/A).
  const deviceRows = rowsOf(wb, 'Devices Detailed')
  const immutableCount = deviceRows.filter((r) => {
    const lock = cellStr(r, 'DD Retention Lock Mode')
    return isPresent(lock) && lock.toUpperCase() !== 'NONE'
  }).length
  const backupRows = rowsOf(wb, 'Backups')
  const replicatedCount = backupRows.filter((r) => isPresent(cellStr(r, 'Clone Status'))).length
  const windowSize = backupRows.length
  const deviceTotal = deviceRows.length

  return {
    meta: wb.meta,
    inUse,
    idleAgents,
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
      successPct: jobsTotal > 0 ? (counts.Succeeded ?? 0) / jobsTotal : 0,
      capped: wb.sheets.Jobs?.capped ?? false,
      windowSize: jobsTotal,
    },
    compliance: {
      appConsistentPct: 0,
      immutablePct: deviceTotal > 0 ? immutableCount / deviceTotal : 0,
      replicatedPct: windowSize > 0 ? replicatedCount / windowSize : 0,
      appConsistentCount: 0,
      immutableCount,
      replicatedCount,
      backupLevelMix: countBy(backupRows, 'Backup Level'),
      windowSize,
      capped: wb.sheets.Backups?.capped ?? false,
    },
    capacity: {
      targets,
      flagged: targets.filter((t) => t.flagged),
      mtreeCount: distinctCount(wb, 'Dedup Jobs', 'Mtree Name'),
    },
    policies: { count: policyNames.size, byPurpose: {}, perPolicy: [] },
    provenance: networkerProvenance(windowSize),
  }
}
