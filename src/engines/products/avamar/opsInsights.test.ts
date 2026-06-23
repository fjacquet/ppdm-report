import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { computeAvamarOpsInsights } from './opsInsights'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('computeAvamarOpsInsights', () => {
  it('agent versions sorted by count desc', () => {
    const oi = computeAvamarOpsInsights(
      wb({
        'Client Version Count': [
          ['Agent Version', 'Total'],
          ['19.1.100-38', 1],
          ['19.4.100-116', 4],
        ],
      }),
    )
    expect(oi.agentVersions).toEqual([
      { version: '19.4.100-116', count: 4 },
      { version: '19.1.100-38', count: 1 },
    ])
  })

  it('at-risk overtime + stale, and longest backups by duration desc', () => {
    const oi = computeAvamarOpsInsights(
      wb({
        'Overtime Clients': [
          ['Full Domain Name', 'Client Type'],
          ['/clients/x', 'VREGULAR'],
        ],
        'Clients No Backups 7 Days': [['Display Full Domain'], ['/clients/y']],
        'Top50 Longest Backups': [
          ['Server', 'Policy Type', 'Duration Hr', 'Capacity GiB', 'Throughput MB/sec'],
          ['s1', 'Windows File System', 10, 0, 0],
          ['s2', 'Linux VMware Image', 24.5, 100, 5],
        ],
      }),
    )
    expect(oi.atRisk.overtime.items).toEqual([{ name: '/clients/x', clientType: 'VREGULAR' }])
    expect(oi.atRisk.staleBackups.items).toEqual([{ name: '/clients/y' }])
    expect(oi.longestBackups.items[0]?.server).toBe('s2')
    expect(oi.longestBackups.items[0]?.durationHr).toBe(24.5)
    expect(oi.longestBackups.total).toBe(2)
  })
})
