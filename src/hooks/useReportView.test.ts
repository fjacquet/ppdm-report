import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useReportStore } from '../store/reportStore'
import type { ParsedWorkbook, SheetData } from '../types/ppdm'
import { useReportView } from './useReportView'

function sheet(name: string, rows: Array<Record<string, string>>): SheetData {
  return { name, headers: Object.keys(rows[0] ?? {}), rows, capped: false }
}

const wb: ParsedWorkbook = {
  meta: { projectId: '', customer: 'WHO', collectorBuild: '', capturedAt: '', baseTen: true },
  sheets: { 'SQL Databases': sheet('SQL Databases', [{ 'Protection Status': 'PROTECTED' }]) },
  inUse: ['SQL Databases'],
  idleAgents: [],
  warnings: [],
}

describe('useReportView', () => {
  beforeEach(() => useReportStore.getState().clear())

  it('returns null when no workbook is loaded', () => {
    const { result } = renderHook(() => useReportView())
    expect(result.current).toBeNull()
  })

  it('derives the ReportView from the stored workbook', () => {
    useReportStore.getState().setWorkbook(wb)
    const { result } = renderHook(() => useReportView())
    expect(result.current?.meta.customer).toBe('WHO')
    expect(result.current?.coverage.overall.protected).toBe(1)
  })
})
