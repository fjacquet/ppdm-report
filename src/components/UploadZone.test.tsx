import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }))
vi.mock('../hooks/useReportUpload', () => ({
  useReportUpload: () => ({ upload: uploadMock, busy: false, error: null }),
}))

import { UploadZone } from './UploadZone'

describe('UploadZone', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    uploadMock.mockClear()
  })
  afterEach(() => cleanup())

  it('uploads all dropped .xlsx files, ignoring non-xlsx', () => {
    const { container } = render(<UploadZone />)
    const zone = container.firstChild as HTMLElement
    const a = new File(['x'], 'paris.xlsx')
    const b = new File(['x'], 'lyon.xlsx')
    const c = new File(['x'], 'notes.txt')
    fireEvent.drop(zone, { dataTransfer: { files: [a, b, c] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const passed = uploadMock.mock.calls[0]?.[0] as File[]
    expect(passed.map((f) => f.name)).toEqual(['paris.xlsx', 'lyon.xlsx'])
  })

  it('does not call upload when no .xlsx is present', () => {
    const { container } = render(<UploadZone />)
    const zone = container.firstChild as HTMLElement
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'notes.txt')] } })
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('uploads files chosen via the input', () => {
    render(<UploadZone />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'PPDM.xlsx')] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it('marks the zone drag-active on dragover', () => {
    const { container } = render(<UploadZone />)
    const zone = container.firstChild as HTMLElement
    fireEvent.dragOver(zone)
    expect(zone.getAttribute('data-drag-active')).toBe('true')
  })
})
