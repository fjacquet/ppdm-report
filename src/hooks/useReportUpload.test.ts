import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeWorkbook } from '../engines/parser/normalizeWorkbook'
import { parseInWorker } from '../engines/parser/parseInWorker'
import { useReportStore } from '../store/reportStore'
import { avamarWorkbookBuffer, networkerWorkbookBuffer } from '../test-helpers/workbooks'
import { useReportUpload } from './useReportUpload'

vi.mock('../engines/parser/parseInWorker')

const minimalWorkbook = {
  meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
  // A PPDM-signature sheet so detectProduct admits this workbook (gating is real now).
  sheets: { 'Storage Targets': { name: 'Storage Targets', headers: [], rows: [], capped: false } },
  warnings: [],
}

describe('useReportUpload', () => {
  beforeEach(() => {
    useReportStore.getState().clear()
    vi.mocked(parseInWorker).mockReset()
  })

  it('adds successful files and records failures without aborting the batch', async () => {
    vi.mocked(parseInWorker).mockImplementation((file: File) => {
      if (file.name === 'bad.xlsx') return Promise.reject(new Error('parse error'))
      return Promise.resolve(minimalWorkbook)
    })

    const { result } = renderHook(() => useReportUpload())

    await act(async () => {
      await result.current.upload([new File(['x'], 'bad.xlsx'), new File(['x'], 'good.xlsx')])
    })

    const servers = useReportStore.getState().servers
    expect(servers).toHaveLength(1)
    expect(servers[0]?.label).toBe('good')
    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('bad.xlsx')
    expect(result.current.busy).toBe(false)
  })

  it('rejects unsupported files while accepting supported ones in the same batch', async () => {
    const unknownWorkbook = {
      meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
      // No PPDM-signature sheet → detectProduct returns 'unknown'
      sheets: { Sheet1: { name: 'Sheet1', headers: [], rows: [], capped: false } },
      warnings: [],
    }

    vi.mocked(parseInWorker).mockImplementation((file: File) => {
      if (file.name === 'unsupported.xlsx') return Promise.resolve(unknownWorkbook)
      return Promise.resolve(minimalWorkbook)
    })

    const { result } = renderHook(() => useReportUpload())

    await act(async () => {
      await result.current.upload([
        new File(['x'], 'unsupported.xlsx'),
        new File(['x'], 'good.xlsx'),
      ])
    })

    const servers = useReportStore.getState().servers
    expect(servers).toHaveLength(1)
    expect(servers[0]?.label).toBe('good')
    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('unsupported.xlsx')
    expect(result.current.error).toContain('Unrecognized or unsupported')
    expect(result.current.busy).toBe(false)
  })

  it('admits an Avamar workbook (now a supported product)', async () => {
    const ava = normalizeWorkbook(avamarWorkbookBuffer())
    vi.mocked(parseInWorker).mockResolvedValueOnce(ava)
    const { result } = renderHook(() => useReportUpload())
    await act(async () => {
      await result.current.upload([new File(['x'], 'ava.xlsx')])
    })
    expect(useReportStore.getState().servers).toHaveLength(1)
    expect(useReportStore.getState().servers[0]?.product).toBe('avamar')
    expect(result.current.error).toBeNull()
  })

  it('admits a NetWorker workbook (now a supported product)', async () => {
    const nw = normalizeWorkbook(networkerWorkbookBuffer())
    vi.mocked(parseInWorker).mockResolvedValueOnce(nw)
    const { result } = renderHook(() => useReportUpload())
    await act(async () => {
      await result.current.upload([new File(['x'], 'nw.xlsx')])
    })
    expect(useReportStore.getState().servers).toHaveLength(1)
    expect(useReportStore.getState().servers[0]?.product).toBe('networker')
    expect(result.current.error).toBeNull()
  })
})
