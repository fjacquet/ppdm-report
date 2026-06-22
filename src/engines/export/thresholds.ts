import type { ExportTone } from './types'

/**
 * Value → tone bands — the single source of truth for "what color is this number?"
 * (the CTO test). All *Pct inputs are 0..1 ratios EXCEPT utilizationTone (0..100).
 */
export function coverageTone(pct: number): ExportTone {
  if (pct >= 0.95) return 'ok'
  if (pct >= 0.8) return 'warn'
  return 'bad'
}

export function jobSuccessTone(pct: number): ExportTone {
  if (pct >= 0.98) return 'ok'
  if (pct >= 0.9) return 'warn'
  return 'bad'
}

export function immutableTone(pct: number): ExportTone {
  if (pct >= 0.8) return 'ok'
  if (pct >= 0.3) return 'warn'
  return 'bad'
}

export function replicatedTone(pct: number): ExportTone {
  if (pct >= 0.8) return 'ok'
  if (pct >= 0.5) return 'warn'
  return 'bad'
}

export function appConsistentTone(pct: number): ExportTone {
  if (pct >= 0.8) return 'ok'
  if (pct >= 0.5) return 'warn'
  return 'bad'
}

/** Data Domain utilization, expressed 0..100. */
export function utilizationTone(pct: number): ExportTone {
  if (pct >= 85) return 'bad'
  if (pct >= 70) return 'warn'
  return 'ok'
}
