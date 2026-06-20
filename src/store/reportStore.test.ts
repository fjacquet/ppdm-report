import { beforeEach, describe, expect, it } from 'vitest'
import type { RawWorkbook, ServerWorkbook } from '../types/ppdm'
import { useReportStore } from './reportStore'

function wb(customer: string): RawWorkbook {
  return {
    meta: { projectId: '', customer, collectorBuild: '', capturedAt: '', baseTen: true },
    sheets: {},
    warnings: [],
  }
}
const srv = (label: string, customer = label): ServerWorkbook => ({
  label,
  product: 'ppdm',
  workbook: wb(customer),
})

describe('reportStore', () => {
  beforeEach(() => useReportStore.getState().clear())

  it('starts empty', () => {
    expect(useReportStore.getState().servers).toEqual([])
  })

  it('appends servers (does not replace)', () => {
    useReportStore.getState().addServers([srv('a')])
    useReportStore.getState().addServers([srv('b')])
    expect(useReportStore.getState().servers.map((s) => s.label)).toEqual(['a', 'b'])
  })

  it('suffixes colliding labels on add', () => {
    useReportStore.getState().addServers([srv('ppdm'), srv('ppdm')])
    expect(useReportStore.getState().servers.map((s) => s.label)).toEqual(['ppdm', 'ppdm (2)'])
  })

  it('removes a server by label', () => {
    useReportStore.getState().addServers([srv('a'), srv('b')])
    useReportStore.getState().removeServer('a')
    expect(useReportStore.getState().servers.map((s) => s.label)).toEqual(['b'])
  })

  it('clear empties the list', () => {
    useReportStore.getState().addServers([srv('a')])
    useReportStore.getState().clear()
    expect(useReportStore.getState().servers).toEqual([])
  })

  it('starts with assessment flavor and setFlavor updates it', () => {
    expect(useReportStore.getState().flavor).toBe('assessment')
    useReportStore.getState().setFlavor('ops')
    expect(useReportStore.getState().flavor).toBe('ops')
    useReportStore.getState().setFlavor('assessment')
  })
})
