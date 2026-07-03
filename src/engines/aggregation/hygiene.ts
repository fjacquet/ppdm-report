import { serialToIso } from '../parser/serialToIso'

export const HYGIENE_KINDS = [
  'datasetUnused',
  'retentionUnused',
  'scheduleUnused',
  'clientInactive',
  'clientOvertime',
  'license',
] as const
export type HygieneKind = (typeof HYGIENE_KINDS)[number]

export type LicenseStatus = 'ok' | 'expiring' | 'expired'

/** One flagged hygiene finding. */
export interface HygieneItem {
  kind: HygieneKind
  name: string
  detail?: string
  licenseStatus?: LicenseStatus
}

export interface Hygiene {
  items: HygieneItem[]
  countByKind: Record<HygieneKind, number>
  /** Reclaimable cleanup count: datasetUnused + retentionUnused + scheduleUnused + clientInactive only. */
  cleanupTotal: number
  expiredLicenses: number
  expiringLicenses: number
}

/** Kinds that represent reclaimable cleanup work — overtime is a risk note, license is a compliance note. */
const CLEANUP_KINDS: readonly HygieneKind[] = [
  'datasetUnused',
  'retentionUnused',
  'scheduleUnused',
  'clientInactive',
]

function emptyCountByKind(): Record<HygieneKind, number> {
  return {
    datasetUnused: 0,
    retentionUnused: 0,
    scheduleUnused: 0,
    clientInactive: 0,
    clientOvertime: 0,
    license: 0,
  }
}

export function emptyHygiene(): Hygiene {
  return {
    items: [],
    countByKind: emptyCountByKind(),
    cleanupTotal: 0,
    expiredLicenses: 0,
    expiringLicenses: 0,
  }
}

/** Per-kind counts + license compliance rollup from a flat list of findings. Pure. */
export function computeHygiene(items: HygieneItem[]): Hygiene {
  const countByKind = emptyCountByKind()
  let expiredLicenses = 0
  let expiringLicenses = 0
  for (const item of items) {
    countByKind[item.kind]++
    if (item.kind === 'license') {
      if (item.licenseStatus === 'expired') expiredLicenses++
      else if (item.licenseStatus === 'expiring') expiringLicenses++
    }
  }
  const cleanupTotal = CLEANUP_KINDS.reduce((sum, kind) => sum + countByKind[kind], 0)
  return { items, countByKind, cleanupTotal, expiredLicenses, expiringLicenses }
}

const MS_PER_DAY = 86_400_000
const EXPIRING_WINDOW_MS = 90 * MS_PER_DAY

/**
 * Deterministic license-expiry classification. Never uses `Date.now()` — expiry is always
 * measured against the workbook's own `capturedAt`.
 *
 * `raw` may be an Excel serial (as a string), a parseable date string, or free text
 * (e.g. "Authorized - No expiration date") — text with no recoverable date is 'ok' with no date.
 */
export function classifyLicenseExpiry(
  raw: string,
  capturedAt: string,
): { status: LicenseStatus; expiresOn?: string } {
  const trimmed = raw.trim()
  let iso: string | undefined
  const asSerial = Number(trimmed)
  if (trimmed !== '' && Number.isFinite(asSerial) && asSerial > 0) {
    iso = serialToIso(asSerial)
  } else {
    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) iso = new Date(parsed).toISOString()
  }
  if (!iso) return { status: 'ok' }

  const expiresOn = iso.slice(0, 10)
  if (!capturedAt) return { status: 'ok', expiresOn }

  const diffMs = Date.parse(iso) - Date.parse(capturedAt)
  if (diffMs < 0) return { status: 'expired', expiresOn }
  if (diffMs <= EXPIRING_WINDOW_MS) return { status: 'expiring', expiresOn }
  return { status: 'ok', expiresOn }
}

/** Fold per-server Hygiene into one. Identity on a single element. Pure. */
export function mergeHygiene(list: Hygiene[]): Hygiene {
  const first = list[0]
  if (!first) return emptyHygiene()
  if (list.length === 1) return first
  return computeHygiene(list.flatMap((h) => h.items))
}
