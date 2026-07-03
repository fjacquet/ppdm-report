import type { RawWorkbook } from '../../../types/ppdm'
import {
  classifyLicenseExpiry,
  computeHygiene,
  type Hygiene,
  type HygieneItem,
} from '../../aggregation/hygiene'
import { cellStr } from '../../aggregation/rows'

const rowsOf = (wb: RawWorkbook, sheet: string) => wb.sheets[sheet]?.rows ?? []

/** `Licenses` → license findings. Rows with a blank `License Name` are skipped
 * (same no-data guard as the other product hygiene adapters). */
function licenseItems(wb: RawWorkbook): HygieneItem[] {
  return rowsOf(wb, 'Licenses')
    .map((r) => ({
      name: cellStr(r, 'License Name'),
      enablerCode: cellStr(r, 'Enabler Code'),
      expiration: cellStr(r, 'Expiration Date'),
    }))
    .filter((r) => r.name !== '')
    .map((r) => ({
      kind: 'license' as const,
      name: r.name,
      detail: r.enablerCode !== '' ? r.enablerCode : undefined,
      licenseStatus: classifyLicenseExpiry(r.expiration, wb.meta.capturedAt).status,
    }))
}

/**
 * NetWorker hygiene findings: license expiry only — no dataset/retention/schedule
 * unused sheets or client inactivity data on this product. Pure.
 */
export function networkerHygiene(wb: RawWorkbook): Hygiene {
  return computeHygiene(licenseItems(wb))
}
