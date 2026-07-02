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

/** At-risk client count — any breach is a warning. */
export function atRiskTone(count: number): ExportTone {
  return count === 0 ? 'ok' : 'warn'
}

/** Backup duration (hours) — long jobs threaten the window. */
export function backupDurationTone(hours: number): ExportTone {
  if (hours >= 12) return 'bad'
  if (hours >= 4) return 'warn'
  return 'ok'
}

/** Repeat-failure clients (≥3 distinct failure-days). */
export function repeatFailureTone(count: number): ExportTone {
  if (count >= 5) return 'bad'
  if (count >= 1) return 'warn'
  return 'ok'
}

/** Share of jobs queued > 15 min, expressed 0..1. */
export function queueDelayTone(pct: number): ExportTone {
  return pct > 0.1 ? 'warn' : 'ok'
}

/** Capacity-weighted dedupe % Common, expressed 0..100. */
export function dedupeCommonTone(pct: number): ExportTone {
  return pct < 50 ? 'warn' : 'ok'
}

/** Daily change rate (bytes sent / bytes processed), expressed 0..1. */
export function changeRateTone(pct: number): ExportTone {
  return pct > 0.1 ? 'warn' : 'ok'
}

/** Share of replication activities that failed or only partially completed, 0..1. */
export function replicationIssueTone(pct: number): ExportTone {
  if (pct >= 0.05) return 'bad'
  if (pct > 0) return 'warn'
  return 'ok'
}
