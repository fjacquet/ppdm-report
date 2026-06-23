import type { Cell, RawWorkbook } from '../../../types/ppdm'
import { TOP_N_DEFAULT } from '../../../types/ppdm'
import type {
  AgentVersionRow,
  AtRiskClient,
  LongBackupRow,
  OpsInsights,
} from '../../../types/reportView'
import { cellNum, cellStr } from '../../aggregation/rows'
import { topN } from '../../aggregation/topN'

/** Optional numeric cell: undefined when blank, the number (incl. 0) otherwise. */
function optNum(row: Record<string, Cell>, key: string): number | undefined {
  return cellStr(row, key) === '' ? undefined : cellNum(row, key)
}

/** Avamar operational insights: agent-version spread, at-risk clients, longest backups. Pure. */
export function computeAvamarOpsInsights(wb: RawWorkbook): OpsInsights {
  const agentVersions: AgentVersionRow[] = (wb.sheets['Client Version Count']?.rows ?? [])
    .map((r) => ({ version: cellStr(r, 'Agent Version'), count: cellNum(r, 'Total') }))
    .filter((r) => r.version !== '')
    .sort((a, b) => b.count - a.count)

  const overtime = topN<AtRiskClient>(
    (wb.sheets['Overtime Clients']?.rows ?? []).map((r) => {
      const clientType = cellStr(r, 'Client Type')
      return clientType === ''
        ? { name: cellStr(r, 'Full Domain Name') }
        : { name: cellStr(r, 'Full Domain Name'), clientType }
    }),
    TOP_N_DEFAULT,
    () => 0,
  )

  const staleBackups = topN<AtRiskClient>(
    (wb.sheets['Clients No Backups 7 Days']?.rows ?? []).map((r) => ({
      name: cellStr(r, 'Display Full Domain'),
    })),
    TOP_N_DEFAULT,
    () => 0,
  )

  const longestBackups = topN<LongBackupRow>(
    (wb.sheets['Top50 Longest Backups']?.rows ?? []).map((r) => ({
      server: cellStr(r, 'Server'),
      policyType: cellStr(r, 'Policy Type'),
      durationHr: cellNum(r, 'Duration Hr'),
      capacityGb: optNum(r, 'Capacity GiB'),
      throughputMbSec: optNum(r, 'Throughput MB/sec'),
    })),
    TOP_N_DEFAULT,
    (r) => r.durationHr,
  )

  return { agentVersions, atRisk: { overtime, staleBackups }, longestBackups }
}
