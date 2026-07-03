import type { RawWorkbook } from '../../../types/ppdm'
import {
  computeHygiene,
  type Hygiene,
  type HygieneItem,
  type HygieneKind,
} from '../../aggregation/hygiene'
import { cellStr } from '../../aggregation/rows'

const rowsOf = (wb: RawWorkbook, sheet: string) => wb.sheets[sheet]?.rows ?? []

/** Domain detail string: blank when the domain is absent or the root '/'. */
function domainDetail(domain: string): string | undefined {
  return domain !== '' && domain !== '/' ? domain : undefined
}

/** `Dataset Not In Use` / `Retention Not In Use` / `Schedule Not In Use` → one kind each.
 * Rows with a blank `Name` are skipped — sparse grids carry a single-cell
 * "The query executed did not return any data." sheet, which must yield zero items. */
function notInUseItems(wb: RawWorkbook, sheet: string, kind: HygieneKind): HygieneItem[] {
  return rowsOf(wb, sheet)
    .map((r) => ({ name: cellStr(r, 'Name'), domain: cellStr(r, 'Domain') }))
    .filter((r) => r.name !== '')
    .map((r) => ({ kind, name: r.name, detail: domainDetail(r.domain) }))
}

/** `Inactive Clients` → clientInactive. Rows with a blank `Full Domain` are skipped
 * (same no-data guard as the not-in-use sheets). */
function inactiveClientItems(wb: RawWorkbook): HygieneItem[] {
  return rowsOf(wb, 'Inactive Clients')
    .map((r) => ({ name: cellStr(r, 'Full Domain'), clientType: cellStr(r, 'Client Type') }))
    .filter((r) => r.name !== '')
    .map((r) => ({
      kind: 'clientInactive' as const,
      name: r.name,
      detail: r.clientType !== '' ? r.clientType : undefined,
    }))
}

/** `Overtime Clients` → clientOvertime. Rows with a blank `Full Domain Name` are skipped. */
function overtimeClientItems(wb: RawWorkbook): HygieneItem[] {
  return rowsOf(wb, 'Overtime Clients')
    .map((r) => ({ name: cellStr(r, 'Full Domain Name'), clientType: cellStr(r, 'Client Type') }))
    .filter((r) => r.name !== '')
    .map((r) => ({
      kind: 'clientOvertime' as const,
      name: r.name,
      detail: r.clientType !== '' ? r.clientType : undefined,
    }))
}

/**
 * Avamar hygiene findings: unused datasets/retentions/schedules, inactive clients,
 * and overtime (long-running) clients. No license data on this product — the
 * `license` kind never appears. Pure.
 */
export function avamarHygiene(wb: RawWorkbook): Hygiene {
  const items: HygieneItem[] = [
    ...notInUseItems(wb, 'Dataset Not In Use', 'datasetUnused'),
    ...notInUseItems(wb, 'Retention Not In Use', 'retentionUnused'),
    ...notInUseItems(wb, 'Schedule Not In Use', 'scheduleUnused'),
    ...inactiveClientItems(wb),
    ...overtimeClientItems(wb),
  ]
  return computeHygiene(items)
}
