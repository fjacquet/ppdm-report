import { describe, expect, it } from 'vitest'
import {
  appConsistentTone,
  coverageTone,
  immutableTone,
  jobSuccessTone,
  replicatedTone,
  utilizationTone,
} from './thresholds'

describe('thresholds', () => {
  it('coverageTone: ≥0.95 ok, ≥0.80 warn, else bad', () => {
    expect(coverageTone(0.96)).toBe('ok')
    expect(coverageTone(0.95)).toBe('ok')
    expect(coverageTone(0.85)).toBe('warn')
    expect(coverageTone(0.8)).toBe('warn')
    expect(coverageTone(0.79)).toBe('bad')
  })

  it('jobSuccessTone: ≥0.98 ok, ≥0.90 warn, else bad', () => {
    expect(jobSuccessTone(0.99)).toBe('ok')
    expect(jobSuccessTone(0.93)).toBe('warn')
    expect(jobSuccessTone(0.89)).toBe('bad')
  })

  it('immutableTone: ≥0.80 ok, ≥0.30 warn, 0 bad', () => {
    expect(immutableTone(0.9)).toBe('ok')
    expect(immutableTone(0.5)).toBe('warn')
    expect(immutableTone(0)).toBe('bad')
  })

  it('replicatedTone / appConsistentTone: ≥0.80 ok, ≥0.50 warn, else bad', () => {
    expect(replicatedTone(0.8)).toBe('ok')
    expect(replicatedTone(0.6)).toBe('warn')
    expect(replicatedTone(0.32)).toBe('bad')
    expect(appConsistentTone(0.77)).toBe('warn')
  })

  it('utilizationTone takes 0..100: <70 ok, 70–85 warn, ≥85 bad', () => {
    expect(utilizationTone(40)).toBe('ok')
    expect(utilizationTone(75)).toBe('warn')
    expect(utilizationTone(87.6)).toBe('bad')
  })
})
