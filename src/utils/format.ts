/**
 * Locale-aware display formatters — ported from vatlas/vsizer
 * (`src/utils/format.ts`). All helpers are pure functions with no external
 * imports, so the full set is portable.
 *
 * PPDM export declares base-10 units; `fmtBytes` below uses base-10
 * (KB = 1 000, MB = 1 000 000, …). The base-2 `fmtMemMb` from vatlas is
 * pruned here because PPDM storage figures are base-10.
 *
 * The em-dash sentinel on non-finite input is mandatory (never 0 / "N/A").
 */

/**
 * Locale-aware integer formatter. Returns an em-dash for non-finite inputs
 * so the dashboard can render placeholders without ad-hoc null guards.
 */
export const fmtInt = (n: number, locale = 'fr-FR'): string =>
  Number.isFinite(n) ? n.toLocaleString(locale, { maximumFractionDigits: 0 }) : '—'

/**
 * Alias matching the task-brief interface name.
 */
export const formatNumber = fmtInt

/**
 * Renders a unit-bearing GHz value from MHz (one decimal of precision).
 */
export const fmtGhz = (mhz: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(mhz)) return '—'
  const ghz = mhz / 1000
  return `${ghz.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} GHz`
}

/**
 * Locale-aware unitless GHz formatter with adaptive precision: one
 * decimal for sub-10 values, integer otherwise. Returns em-dash for
 * non-finite inputs.
 */
export const fmtGhzNumber = (ghz: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(ghz)) return '—'
  const opts =
    Math.abs(ghz) < 10
      ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
      : { maximumFractionDigits: 0 }
  return ghz.toLocaleString(locale, opts)
}

/**
 * Renders an already-GHz value as a unit-bearing string. Adaptive precision.
 */
export const fmtGhzValue = (ghz: number, locale = 'fr-FR'): string =>
  Number.isFinite(ghz) ? `${fmtGhzNumber(ghz, locale)} GHz` : '—'

/**
 * Renders an already-MHz value as a unit-bearing string (`"385 MHz"`).
 * `0` is a sentinel ("no powered-on vCPUs to divide by") → em-dash.
 */
export const fmtMhzValue = (mhz: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(mhz) || mhz === 0) return '—'
  return `${Math.round(mhz).toLocaleString(locale, { maximumFractionDigits: 0 })} MHz`
}

/**
 * Renders a 0..1 ratio as a localized percent (one decimal). Inputs
 * outside [0, 1] pass through unmodified — clamp upstream if needed.
 */
export const fmtPercent = (ratio: number, locale = 'fr-FR'): string =>
  Number.isFinite(ratio)
    ? ratio.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 })
    : '—'

/** Same as `fmtPercent` but with no decimals — `"23 %"`. */
export const fmtPercentWhole = (ratio: number, locale = 'fr-FR'): string =>
  Number.isFinite(ratio)
    ? ratio.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 0 })
    : '—'

/**
 * Format an already-percentage value (0..200) with one decimal and a
 * trailing `%`. Distinct from `fmtPercent` (which expects a 0..1 ratio).
 */
export const fmtPercentValue = (percent: number, locale = 'fr-FR'): string =>
  Number.isFinite(percent)
    ? `${percent.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
    : '—'

/**
 * Render a consolidation ratio as `"X.X : 1"`. Locale-aware decimal
 * separator. Em-dash for non-finite or zero ratios.
 */
export const fmtRatio = (ratio: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(ratio) || ratio === 0) return '—'
  const formatted = ratio.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${formatted} : 1`
}

/**
 * Formats a byte count with base-10 tiers (PPDM exports base-10 units):
 *   ≥ 1 000 000 000 000 B → `"X.X TB"`
 *   ≥ 1 000 000 000 B     → `"X.X GB"`
 *   ≥ 1 000 000 B         → `"X.X MB"`
 *   ≥ 1 000 B             → `"X.X KB"`
 *   else                  → `"X B"`
 */
export const formatBytes = (bytes: number, locale = 'fr-FR'): string => {
  if (!Number.isFinite(bytes)) return '—'
  const opts = { maximumFractionDigits: 1, minimumFractionDigits: 1 } as const
  const abs = Math.abs(bytes)
  if (abs >= 1e12) return `${(bytes / 1e12).toLocaleString(locale, opts)} TB`
  if (abs >= 1e9) return `${(bytes / 1e9).toLocaleString(locale, opts)} GB`
  if (abs >= 1e6) return `${(bytes / 1e6).toLocaleString(locale, opts)} MB`
  if (abs >= 1e3) return `${(bytes / 1e3).toLocaleString(locale, opts)} KB`
  return `${Math.round(bytes).toLocaleString(locale, { maximumFractionDigits: 0 })} B`
}

/**
 * Locale-aware date formatter. Takes an ISO `YYYY-MM-DD` string; returns
 * the em-dash sentinel for any unparseable input (never `0`/"N/A").
 * Callers pass `i18n.language`; the `'fr-FR'` default mirrors the other
 * formatters.
 */
export const fmtDate = (iso: string, locale = 'fr-FR'): string => {
  // Parse the YYYY-MM-DD components into a LOCAL-time date. `Date.parse` would
  // read the bare ISO date as UTC midnight, which `toLocaleDateString` then
  // shifts back a day for UTC-negative hosts (e.g. '2026-05-17' → "May 16").
  // The round-trip check rejects overflow (e.g. '2026-02-30') → '—' sentinel.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m === null) return '—'
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const date = new Date(year, month, day)
  return date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day
    ? '—'
    : date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
}

/**
 * Alias matching the task-brief interface name.
 */
export const formatDate = fmtDate
