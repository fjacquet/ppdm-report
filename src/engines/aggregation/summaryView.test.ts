import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeWorkbook, summaryWorkbookBuffer } from '../../test-helpers/workbooks'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { summaryView } from './summaryView'

it('builds discovered-only front-end volumetry per type and marks it available', () => {
  const wb = normalizeWorkbook(
    makeWorkbook({
      Details: [
        ['Project Name', 'S'],
        ['Date', '18/02/2025 03:54:24'],
        ['Disclaimer', 'Base 10'],
      ],
      'System Configuration': [
        ['Field', 'Value'],
        ['Assets Count', 100],
        ['Number of Protected Assets', 80],
        ['Number of UnProtected Assets', 15],
      ],
      'VMs Count And Cap': [
        ['Field', 'Value'],
        ['VM Asset Count', 60],
        ['VM Capacity Protected Assets (GB)', 2555.53],
        ['VM Capacity Unprotected Assets (GB)', 5552.92],
      ],
    }),
  )
  const view = summaryView(wb)
  const vm = view.frontEnd.byType.find((r) => r.type === 'Virtual Machines')
  expect(vm?.protectedDiscoveredGb).toBeCloseTo(2555.53)
  expect(vm?.unprotectedDiscoveredGb).toBeCloseTo(5552.92)
  expect(vm?.protectedFetbGb).toBeUndefined()
  expect(view.provenance.frontEnd.available).toBe(true)
})

it('treats an absent capacity field as undefined (no invented 0); a present 0 stays measured', () => {
  const wb = normalizeWorkbook(
    makeWorkbook({
      Details: [
        ['Project Name', 'S'],
        ['Date', '18/02/2025 03:54:24'],
        ['Disclaimer', 'Base 10'],
      ],
      'System Configuration': [
        ['Field', 'Value'],
        ['Assets Count', 100],
        ['Number of Protected Assets', 80],
        ['Number of UnProtected Assets', 15],
      ],
      // protected capacity field ABSENT → undefined (not an invented 0)
      'VMs Count And Cap': [
        ['Field', 'Value'],
        ['VM Asset Count', 60],
        ['VM Capacity Unprotected Assets (GB)', 5552.92],
      ],
      // protected capacity field PRESENT with 0 → a genuine measured 0
      'FileSystem Assets Count & Cap': [
        ['Field', 'Value'],
        ['File System Asset Count', 10],
        ['File System Capacity Protected Assets (GB)', 0],
        ['File System Capacity Unprotected Assets (GB)', 100],
      ],
    }),
  )
  const view = summaryView(wb)
  const vm = view.frontEnd.byType.find((r) => r.type === 'Virtual Machines')
  expect(vm?.protectedDiscoveredGb).toBeUndefined()
  expect(vm?.unprotectedDiscoveredGb).toBeCloseTo(5552.92)
  const fs = view.frontEnd.byType.find((r) => r.type === 'File Systems')
  expect(fs?.protectedDiscoveredGb).toBe(0)
  expect(fs?.unprotectedDiscoveredGb).toBeCloseTo(100)
})

describe('summaryView — synthetic summary workbook', () => {
  const v = summaryView(normalizeWorkbook(summaryWorkbookBuffer()))

  it('recovers overall coverage counts from System Configuration', () => {
    expect(v.coverage.overall.protected).toBe(80)
    expect(v.coverage.overall.unprotected).toBe(15)
    expect(v.coverage.overall.excluded).toBe(5) // 100 - 80 - 15
  })

  it('recovers unprotected count and total capacity for gaps, with no asset list', () => {
    expect(v.gaps.count).toBe(15)
    expect(v.gaps.totalCapacityGb).toBeCloseTo(1234.5, 1) // VM unprotected capacity; others 0
    expect(v.gaps.top.items).toEqual([])
    expect(v.gaps.top.total).toBe(15)
  })

  it('recovers job success totals from Jobs Summary', () => {
    // Successful: Protect 90 + Replicate 5 = 95; total = 95 success + 10 failed = 105.
    expect(v.jobs.counts.SUCCESS).toBe(95)
    expect(v.jobs.total).toBe(105)
    expect(v.jobs.capped).toBe(false)
    expect(v.jobs.successPct).toBeGreaterThan(0.9)
  })

  it('recovers policies (purpose from Category) and DD mtree count', () => {
    expect(v.policies.count).toBe(1)
    expect(v.policies.perPolicy[0]?.name).toBe('pol1')
    expect(v.policies.perPolicy[0]?.purpose).toBe('CENTRALIZED_PROTECTION')
    expect(v.capacity.mtreeCount).toBe(2)
  })

  it('maps in-use asset types to canonical agent sheets (SQL excluded: count 0)', () => {
    expect(v.inUse).toContain('Virtual Machines')
    expect(v.inUse).toContain('File Systems')
    expect(v.inUse).not.toContain('SQL Databases')
  })

  it('marks the four detail-only metrics unavailable', () => {
    expect(v.provenance.compliance.available).toBe(false)
    expect(v.provenance.gapsList.available).toBe(false)
    expect(v.provenance.coverageByType.available).toBe(false)
    expect(v.provenance.storageTargets.available).toBe(false)
    expect(v.coverage.byType).toEqual({})
    expect(v.capacity.targets).toEqual([])
  })
})

// Local-only regression against the real CHUV summary export; skipped in CI where ref/ is absent.
describe.skipIf(!existsSync('ref/chuv-a1n01136i.xlsx'))('summaryView — chuv-a1n01136i', () => {
  const wb = existsSync('ref/chuv-a1n01136i.xlsx')
    ? normalizeWorkbook(new Uint8Array(readFileSync('ref/chuv-a1n01136i.xlsx')).buffer)
    : normalizeWorkbook(summaryWorkbookBuffer())
  const v = summaryView(wb)

  it('recovers overall coverage counts from System Configuration', () => {
    expect(v.coverage.overall.protected).toBe(1782)
    expect(v.coverage.overall.unprotected).toBe(43)
    expect(v.coverage.overall.excluded).toBe(30) // 1855 - 1782 - 43
  })

  it('recovers unprotected count and total capacity for gaps, with no asset list', () => {
    expect(v.gaps.count).toBe(43)
    expect(v.gaps.totalCapacityGb).toBeCloseTo(10222.09, 1) // VM unprotected capacity; others 0
    expect(v.gaps.top.items).toEqual([])
    expect(v.gaps.top.total).toBe(43)
  })

  it('recovers job success totals from Jobs Summary', () => {
    // Successful: Config 8 + Delete 1632 + Discover 60 + Protect 1993 + Replicate 1930 + DR 318 = 5941
    expect(v.jobs.counts.SUCCESS).toBe(5941)
    expect(v.jobs.capped).toBe(false)
    expect(v.jobs.successPct).toBeGreaterThan(0.99)
  })

  it('recovers policies (purpose from Category) and DD mtree count', () => {
    expect(v.policies.count).toBeGreaterThan(0)
    expect(v.capacity.mtreeCount).toBe(97)
  })

  it('maps in-use asset types to canonical agent sheets', () => {
    expect(v.inUse).toContain('Virtual Machines')
    expect(v.inUse).toContain('File Systems')
  })

  it('marks the four detail-only metrics unavailable', () => {
    expect(v.provenance.compliance.available).toBe(false)
    expect(v.provenance.gapsList.available).toBe(false)
    expect(v.provenance.coverageByType.available).toBe(false)
    expect(v.provenance.storageTargets.available).toBe(false)
    expect(v.coverage.byType).toEqual({})
    expect(v.capacity.targets).toEqual([])
  })
})
