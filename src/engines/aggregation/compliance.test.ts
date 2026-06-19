import { describe, expect, it } from 'vitest'
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { computeCompliance } from './compliance'

function wb(rows: Array<Record<string, string>>, capped = false): ParsedWorkbook {
  const sheet: SheetData = {
    name: 'Copies',
    headers: ['Data Consistency', 'Lock Status', 'Replica', 'Backup Level'],
    rows,
    capped,
  }
  return {
    meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: { Copies: sheet },
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}

describe('computeCompliance', () => {
  it('computes consistency, immutability, replication and level mix', () => {
    const c = computeCompliance(
      wb([
        {
          'Data Consistency': 'APPLICATION_CONSISTENT',
          'Lock Status': 'ALL_COPIES_UNLOCKED',
          Replica: 'True',
          'Backup Level': 'FULL',
        },
        {
          'Data Consistency': 'APPLICATION_CONSISTENT',
          'Lock Status': 'ALL_COPIES_UNLOCKED',
          Replica: 'False',
          'Backup Level': 'LOG',
        },
        {
          'Data Consistency': 'CRASH_CONSISTENT',
          'Lock Status': 'GOVERNANCE',
          Replica: 'False',
          'Backup Level': 'FULL',
        },
        {
          'Data Consistency': 'CRASH_CONSISTENT',
          'Lock Status': 'ALL_COPIES_UNLOCKED',
          Replica: 'False',
          'Backup Level': 'LOG',
        },
      ]),
    )
    expect(c.windowSize).toBe(4)
    expect(c.appConsistentPct).toBeCloseTo(0.5, 4)
    expect(c.immutablePct).toBeCloseTo(0.25, 4) // only the GOVERNANCE copy is locked
    expect(c.replicatedPct).toBeCloseTo(0.25, 4)
    expect(c.backupLevelMix).toEqual({ FULL: 2, LOG: 2 })
  })

  it('all-unlocked copies → 0% immutable (the WHO ransomware-gap case)', () => {
    const c = computeCompliance(
      wb([{ 'Lock Status': 'ALL_COPIES_UNLOCKED' }, { 'Lock Status': 'ALL_COPIES_UNLOCKED' }]),
    )
    expect(c.immutablePct).toBe(0)
  })

  it('is safe when Copies is absent', () => {
    const c = computeCompliance({
      meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
      sheets: {},
      inUse: [],
      idleAgents: [],
      warnings: [],
    })
    expect(c.windowSize).toBe(0)
    expect(c.appConsistentPct).toBe(0)
  })

  it('exposes raw numerators alongside percentages', () => {
    const wb = {
      meta: {} as never,
      sheets: {
        Copies: {
          name: 'Copies',
          headers: ['Data Consistency', 'Lock Status', 'Replica', 'Backup Level'],
          rows: [
            {
              'Data Consistency': 'APPLICATION_CONSISTENT',
              'Lock Status': 'GOVERNANCE',
              Replica: 'TRUE',
              'Backup Level': 'FULL',
            },
            {
              'Data Consistency': 'CRASH_CONSISTENT',
              'Lock Status': 'ALL_COPIES_UNLOCKED',
              Replica: 'FALSE',
              'Backup Level': 'FULL',
            },
          ],
          capped: false,
        },
      },
      inUse: [],
      idleAgents: [],
      warnings: [],
    }
    const c = computeCompliance(wb)
    expect(c.appConsistentCount).toBe(1)
    expect(c.immutableCount).toBe(1)
    expect(c.replicatedCount).toBe(1)
  })
})
