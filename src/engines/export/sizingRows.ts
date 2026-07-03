import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtNum, fmtPercent, formatBytes, gbToBytes } from '../../utils/format'

/** Minimal translator surface (i18next TFunction, resolving `ns:key`). */
type TFn = (key: string, opts?: Record<string, unknown>) => string

export type SizingRowKey =
  | 'fetb'
  | 'change'
  | 'dedupe'
  | 'reduction'
  | 'retentionShort'
  | 'retentionLong'
  | 'growth'
  | 'window'
  | 'inactive'

export interface SizingRow {
  key: SizingRowKey
  label: string
  value: string
  basis: string
}

/**
 * Render-only sizing-input rows for a presales architect sizing a successor
 * infrastructure: every value is read straight off `ReportView` fields already
 * computed by the frontEnd/efficiency/capacityTrend/reliability/hygiene
 * families — no new engine metric, only sums/max over existing arrays. A row
 * is included only when its source family's provenance says available AND the
 * specific value actually exists on the view. Pure.
 */
export function buildSizingRows(view: ReportView, t: TFn, locale: string): SizingRow[] {
  const { frontEnd, efficiency, capacityTrend, reliability, hygiene, provenance, meta } = view
  const baseTen = meta.baseTen
  const bytesOf = (gb: number) => formatBytes(gbToBytes(gb, baseTen), locale, baseTen)
  const measured = t('dashboard:sizing.basis.measured')
  const observed = t('dashboard:sizing.basis.observed')
  const label = (key: SizingRowKey) => t(`dashboard:sizing.rows.${key}`)

  const rows: SizingRow[] = []

  if (provenance.frontEnd.available && frontEnd.byType.length > 0) {
    // Mirrors the volumetry section's feTotalCell (buildExportModel.ts): sum only the
    // per-type rows that actually carry a protectedFetbGb figure. Omit the row entirely
    // when none do (nothing honest to sum), and prefix the sum with '≥' when some types
    // are undefined (partial lower bound) — never silently treat unknown as 0.
    const defined = frontEnd.byType.filter((r) => r.protectedFetbGb !== undefined)
    if (defined.length > 0) {
      const sum = defined.reduce((a, r) => a + (r.protectedFetbGb ?? 0), 0)
      const cell = bytesOf(sum)
      const value = defined.length < frontEnd.byType.length ? `≥ ${cell}` : cell
      rows.push({ key: 'fetb', label: label('fetb'), value, basis: measured })
    }
  }

  if (provenance.efficiency.available) {
    if (efficiency.changeRate && efficiency.changeRate.processedBytes > 0) {
      const { sentBytes, processedBytes } = efficiency.changeRate
      rows.push({
        key: 'change',
        label: label('change'),
        value: fmtPercent(sentBytes / processedBytes, locale),
        basis: observed,
      })
    }

    if (efficiency.dedupe?.common) {
      const { num, den } = efficiency.dedupe.common
      rows.push({
        key: 'dedupe',
        label: label('dedupe'),
        value: fmtPercent(num / den / 100, locale),
        basis: observed,
      })
    }

    if (efficiency.dedupe?.global && efficiency.dedupe.global.usedGb > 0) {
      const { logicalGb, usedGb } = efficiency.dedupe.global
      rows.push({
        key: 'reduction',
        label: label('reduction'),
        value: `×${fmtNum(logicalGb / usedGb, locale, 1)}`,
        basis: observed,
      })
    }

    // Retention buckets are exclusive tiers (RETENTION_BUCKET_IDS), each populated from a
    // distinct source column — summing a subset never double-counts. Short = the two
    // shortest tiers (< 30 d, < 60 d); long = the three longest (< 1 y.. ≥ 7 y), leaving the
    // middle "< 180 d" tier out of both summary rows (it belongs to neither honestly).
    if (efficiency.retention) {
      const b = efficiency.retention.totalGbByBucket
      rows.push({
        key: 'retentionShort',
        label: label('retentionShort'),
        value: bytesOf(b.r30 + b.r60),
        basis: measured,
      })
      rows.push({
        key: 'retentionLong',
        label: label('retentionLong'),
        value: bytesOf(b.r1y + b.r7y + b.r7yPlus),
        basis: measured,
      })
    }
  }

  if (provenance.capacityTrend.available) {
    // Highest defined slopePer30d wins — same selection as the capacityTrend section/chip.
    const fastest = capacityTrend.targets.reduce<
      (typeof capacityTrend.targets)[number] | undefined
    >((best, tg) => {
      if (tg.slopePer30d === undefined) return best
      if (best === undefined || best.slopePer30d === undefined) return tg
      return tg.slopePer30d > best.slopePer30d ? tg : best
    }, undefined)
    // Only surface growth when the fastest target is actually growing — same guard as the
    // capacityTrend section's chip (buildExportModel.ts: slopePer30d > 0). A flat/shrinking
    // estate gets no "fastest growth" row.
    if (fastest?.slopePer30d !== undefined && fastest.slopePer30d > 0) {
      // Same signed formatting as capacityTrend's signedSlope helper; the positivity guard
      // above guarantees the '+' prefix always applies here.
      const signedSlope = (s: number) => (s > 0 ? `+${fmtNum(s, locale, 1)}` : fmtNum(s, locale, 1))
      rows.push({
        key: 'growth',
        label: label('growth'),
        value: t('dashboard:sizing.growthValue', {
          slope: signedSlope(fastest.slopePer30d),
          target: fastest.target,
        }),
        basis: observed,
      })
    }
  }

  if (provenance.reliability.available && reliability.queue) {
    rows.push({
      key: 'window',
      label: label('window'),
      value: t('dashboard:sizing.windowValue', {
        pct: fmtPercent(reliability.queue.delayedPct, locale),
        count: fmtInt(reliability.runtime.gt8h, locale),
      }),
      basis: observed,
    })
  }

  if (provenance.hygiene.available && hygiene.items.length > 0) {
    rows.push({
      key: 'inactive',
      label: label('inactive'),
      value: fmtInt(hygiene.countByKind.clientInactive, locale),
      basis: observed,
    })
  }

  return rows
}
