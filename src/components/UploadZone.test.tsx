import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }))
vi.mock('../hooks/useReportUpload', () => ({
  useReportUpload: () => ({ upload: uploadMock, busy: false, error: null }),
}))

// Imported after the mock is registered.
import { UploadZone } from './UploadZone'

describe('UploadZone', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    uploadMock.mockClear()
  })
  afterEach(() => cleanup())

  it('uploads a dropped .xlsx file', () => {
    const { container } = render(<UploadZone />)
    const zone = container.firstChild as HTMLElement
    const file = new File(['x'], 'PPDM.xlsx')
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(uploadMock.mock.calls[0]?.[0]?.name).toBe('PPDM.xlsx')
  })

  it('ignores a dropped non-xlsx file', () => {
    const { container } = render(<UploadZone />)
    const zone = container.firstChild as HTMLElement
    const file = new File(['x'], 'notes.txt')
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('marks the zone drag-active on dragover', () => {
    const { container } = render(<UploadZone />)
    const zone = container.firstChild as HTMLElement
    fireEvent.dragOver(zone)
    expect(zone.getAttribute('data-drag-active')).toBe('true')
  })

  it('uploads a file chosen via the input', () => {
    render(<UploadZone />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'PPDM.xlsx')
    fireEvent.change(input, { target: { files: [file] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })
})
