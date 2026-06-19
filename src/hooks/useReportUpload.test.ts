import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseInWorker } from '../engines/parser/parseInWorker'
import { useReportStore } from '../store/reportStore'
import { useReportUpload } from './useReportUpload'

vi.mock('../engines/parser/parseInWorker')

const minimalWorkbook = {
  meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true },
  sheets: {},
  inUse: [],
  idleAgents: [],
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
})
