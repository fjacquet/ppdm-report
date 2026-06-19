import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useReportStore } from '../store/reportStore'
import type { ParsedWorkbook, ServerWorkbook, SheetData } from '../types/ppdm'
import { useReportView } from './useReportView'

function sheet(name: string, rows: Record<string, string | number>[]): SheetData {
  return { name, headers: rows[0] ? Object.keys(rows[0]) : [], rows, capped: false }
}
function wb(customer: string, sys?: Record<string, string>): ParsedWorkbook {
  const sheets: Record<string, SheetData> = {}
  if (sys) sheets['System Information'] = sheet('System Information', [sys])
  return {
    meta: { projectId: '', customer, collectorBuild: '', capturedAt: '', baseTen: true },
    sheets,
    inUse: [],
    idleAgents: [],
    warnings: [],
  }
}
const srv = (label: string, workbook: ParsedWorkbook): ServerWorkbook => ({ label, workbook })

describe('useReportView', () => {
  beforeEach(() => useReportStore.getState().clear())

  it('returns null with no servers', () => {
    const { result } = renderHook(() => useReportView())
    expect(result.current).toBeNull()
  })

  it('single server: combined present, multiSource false, perServer length 1', () => {
    useReportStore
      .getState()
      .addServers([srv('a', wb('ACME', { 'PowerProtect Version': '19.22' }))])
    const { result } = renderHook(() => useReportView())
    expect(result.current?.multiSource).toBe(false)
    expect(result.current?.perServer).toHaveLength(1)
    expect(result.current?.perServer[0]?.version).toBe('19.22')
    expect(result.current?.combined.meta.customer).toBe('ACME')
  })

  it('two servers: multiSource true, perServer length 2', () => {
    useReportStore.getState().addServers([srv('a', wb('ACME')), srv('b', wb('ACME'))])
    const { result } = renderHook(() => useReportView())
    expect(result.current?.multiSource).toBe(true)
    expect(result.current?.perServer.map((p) => p.label)).toEqual(['a', 'b'])
  })
})
