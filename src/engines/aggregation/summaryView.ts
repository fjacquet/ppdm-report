import { AGENT_SHEETS, type RawWorkbook, type SheetData } from '../../types/ppdm'
import type { ReportView } from '../../types/reportView'
import { emptyBand, finalizeBand } from './coverage'
import { emptyFrontEnd } from './frontEnd'
import { allUnavailable } from './provenance'
import { cellNum, cellStr, countBy } from './rows'

/** Summary "... Count And Cap" sheet → canonical AGENT_SHEETS name (null = no agent sheet). */
const COUNT_CAP: Array<{ sheet: string; agent: string | null }> = [
  { sheet: 'VMs Count And Cap', agent: 'Virtual Machines' },
  { sheet: 'SQL DBs Count & Cap', agent: 'SQL Databases' },
  { sheet: 'Oracle DBs Count & Cap', agent: 'Oracle Databases' },
  { sheet: 'FileSystem Assets Count & Cap', agent: 'File Systems' },
  { sheet: 'Kubernetes Assets & Cap', agent: 'Kubernetes' },
  { sheet: 'VMAX Assets & Cap', agent: null },
  { sheet: 'SAP Hana DBs Assets & Cap', agent: 'SAP HANA Databases' },
  { sheet: 'Exchange DBs Assets & Cap', agent: 'Microsoft Exchange Databases' },
  { sheet: 'NAS Assets & Cap', agent: 'NAS' },
]

/** First Value whose Field matches `pred` in a key/value sheet; 0 when absent. */
function fieldNum(sheet: SheetData | undefined, pred: (field: string) => boolean): number {
  if (!sheet) return 0
  for (const r of sheet.rows) if (pred(cellStr(r, 'Field'))) return cellNum(r, 'Value')
  return 0
}

/** Build a ReportView from an older summary-format workbook. Pure. */
export function summaryView(wb: RawWorkbook): ReportView {
  const sysCfg = wb.sheets['System Configuration']
  const protectedN = fieldNum(sysCfg, (f) => f === 'Number of Protected Assets')
  const unprotectedN = fieldNum(sysCfg, (f) => f === 'Number of UnProtected Assets')
  const assetsN = fieldNum(sysCfg, (f) => f === 'Assets Count')
  const excluded = Math.max(0, assetsN - protectedN - unprotectedN)
  const overall = finalizeBand({
    ...emptyBand(),
    protected: protectedN,
    unprotected: unprotectedN,
    excluded,
  })
  const totalAssets = protectedN + unprotectedN + excluded

  // gaps: count from System Configuration, capacity summed across per-type Count And Cap sheets.
  let unprotectedCapacityGb = 0
  for (const { sheet } of COUNT_CAP) {
    unprotectedCapacityGb += fieldNum(wb.sheets[sheet], (f) =>
      /Capacity Unprotected Assets \(GB\)/i.test(f),
    )
  }

  // jobs: sum the Jobs Summary columns into the detail vocabulary so merges line up.
  const jobRows = wb.sheets['Jobs Summary']?.rows ?? []
  const sumCol = (key: string) => jobRows.reduce((acc, r) => acc + cellNum(r, key), 0)
  const counts: Record<string, number> = {
    SUCCESS: sumCol('Successful Jobs'),
    FAILED: sumCol('Failed Jobs'),
    CANCELLED: sumCol('Cancelled'),
    OK_WITH_ERRORS: sumCol('Ok with Errors'),
    UNKNOWN: sumCol('Unknown'),
    SKIPPED: sumCol('Skipped'),
  }
  const jobsTotal = Object.values(counts).reduce((a, b) => a + b, 0)

  // policies: summary uses 'Category' where detail uses 'Purpose'.
  const policyRows = wb.sheets.Policies?.rows ?? []
  const perPolicy = policyRows.map((r) => ({
    name: cellStr(r, 'Name'),
    purpose: cellStr(r, 'Category'),
    assetCount: cellNum(r, 'Number of Assets'),
    protectionCapacityGb: cellNum(r, 'Total Asset Protection Capacity (GB)'),
  }))

  // inUse: per-type Asset Count > 0, mapped to canonical agent sheet names.
  const inUseSet = new Set<string>()
  for (const { sheet, agent } of COUNT_CAP) {
    if (!agent) continue
    if (fieldNum(wb.sheets[sheet], (f) => /Asset Count$/i.test(f)) > 0) inUseSet.add(agent)
  }

  return {
    meta: wb.meta,
    inUse: AGENT_SHEETS.filter((a) => inUseSet.has(a)),
    idleAgents: [],
    warnings: wb.warnings,
    coverage: { byType: {}, overall },
    gaps: {
      count: unprotectedN,
      totalCapacityGb: unprotectedCapacityGb,
      top: { items: [], total: unprotectedN, shown: 0 },
    },
    jobs: {
      counts,
      total: jobsTotal,
      successPct: jobsTotal > 0 ? (counts.SUCCESS ?? 0) / jobsTotal : 0,
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
    capacity: {
      targets: [],
      flagged: [],
      mtreeCount: wb.sheets['Data Domain Mtrees']?.rows.length ?? 0,
    },
    policies: { count: policyRows.length, byPurpose: countBy(policyRows, 'Category'), perPolicy },
    frontEnd: emptyFrontEnd(),
    provenance: allUnavailable(totalAssets),
  }
}
