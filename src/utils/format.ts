/**
 * Locale-aware display formatters — ported from vatlas/vsizer
 * (`src/utils/format.ts`). All helpers are pure functions with no external
 * imports, so the full set is portable.
 *
 * Base-10 byte formatting (default): PPDM and NetWorker exports declare
 * base-10 units (KB = 1 000, MB = 1 000 000, …). All existing callers that
 * omit the `baseTen` parameter continue to use base-10, so PPDM/NetWorker
 * are unaffected. Pass `baseTen = false` (opt-in) to render base-2
 * GiB/TiB labels — Avamar uses GiB (2^30-based) byte values.
 *
 * The em-dash sentinel on non-finite input is mandatory (never 0 / "N/A").
 */

/**
 * Locale-aware integer formatter. Returns an em-dash for non-finite inputs
 * so the dashboard can render placeholders without ad-hoc null guards.
 */
export const fmtInt = (n: number, locale = 'fr-FR'): string =>
  Number.isFinite(n) ? n.toLocaleString(locale, { maximumFractionDigits: 0 }) : '—'

/** Locale-aware decimal number (default 1 fraction digit). Em-dash for non-finite. */
export const fmtNum = (n: number, locale = 'fr-FR', digits = 1): string =>
  Number.isFinite(n) ? n.toLocaleString(locale, { maximumFractionDigits: digits }) : '—'

/**
 * Alias matching the task-brief interface name.
 */
export const formatNumber = fmtInt

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
 * Formats a byte count with locale-aware tiers.
 *
 * Base-10 (default, `baseTen = true`):
 *   ≥ 1e12 B → `"X.X TB"`, ≥ 1e9 B → `"X.X GB"`, ≥ 1e6 B → `"X.X MB"`,
 *   ≥ 1e3 B → `"X.X KB"`, else → `"X B"`
 *
 * Base-2 (`baseTen = false`):
 *   ≥ 2^40 B → `"X.X TiB"`, ≥ 2^30 B → `"X.X GiB"`, ≥ 2^20 B → `"X.X MiB"`,
 *   ≥ 2^10 B → `"X.X KiB"`, else → `"X B"`
 */
export const formatBytes = (bytes: number, locale = 'fr-FR', baseTen = true): string => {
  if (!Number.isFinite(bytes)) return '—'
  const opts = { maximumFractionDigits: 1, minimumFractionDigits: 1 } as const
  const abs = Math.abs(bytes)
  if (baseTen) {
    if (abs >= 1e12) return `${(bytes / 1e12).toLocaleString(locale, opts)} TB`
    if (abs >= 1e9) return `${(bytes / 1e9).toLocaleString(locale, opts)} GB`
    if (abs >= 1e6) return `${(bytes / 1e6).toLocaleString(locale, opts)} MB`
    if (abs >= 1e3) return `${(bytes / 1e3).toLocaleString(locale, opts)} KB`
    return `${Math.round(bytes).toLocaleString(locale, { maximumFractionDigits: 0 })} B`
  }
  const T = 2 ** 40
  const G = 2 ** 30
  const M = 2 ** 20
  const K = 2 ** 10
  if (abs >= T) return `${(bytes / T).toLocaleString(locale, opts)} TiB`
  if (abs >= G) return `${(bytes / G).toLocaleString(locale, opts)} GiB`
  if (abs >= M) return `${(bytes / M).toLocaleString(locale, opts)} MiB`
  if (abs >= K) return `${(bytes / K).toLocaleString(locale, opts)} KiB`
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

/** Convert gigabytes to bytes; base-10 (×1e9) by default, base-2 GiB (×2^30) when baseTen=false. */
export const gbToBytes = (gb: number, baseTen = true): number => gb * (baseTen ? 1e9 : 2 ** 30)

/** Bytes for a GB value, or the supplied "unknown" label when the size is absent. */
export function formatGbOrUnknown(
  gb: number | undefined,
  locale: string,
  unknown: string,
  baseTen = true,
): string {
  return gb === undefined ? unknown : formatBytes(gbToBytes(gb, baseTen), locale, baseTen)
}
