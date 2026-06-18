import { beforeEach, describe, expect, it } from 'vitest'
import type { ParsedWorkbook } from '../types/ppdm'
import { useReportStore } from './reportStore'

const wb: ParsedWorkbook = {
  meta: { projectId: '', customer: 'WHO', collectorBuild: '', capturedAt: '', baseTen: true },
  sheets: {},
  inUse: ['SQL Databases'],
  idleAgents: ['Oracle Databases'],
  warnings: [],
}

describe('reportStore', () => {
  beforeEach(() => useReportStore.getState().clear())

  it('starts empty', () => {
    expect(useReportStore.getState().workbook).toBeNull()
  })

  it('stores and clears a parsed workbook', () => {
    useReportStore.getState().setWorkbook(wb)
    expect(useReportStore.getState().workbook?.meta.customer).toBe('WHO')
    useReportStore.getState().clear()
    expect(useReportStore.getState().workbook).toBeNull()
  })
})
