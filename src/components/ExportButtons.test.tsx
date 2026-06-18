import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'

const { runMock, viewRef } = vi.hoisted(() => ({
  runMock: vi.fn(),
  viewRef: { current: null as unknown },
}))
vi.mock('../hooks/useExport', () => ({ useExport: () => ({ run: runMock, busy: null }) }))
vi.mock('../hooks/useReportView', () => ({ useReportView: () => viewRef.current }))

import { ExportButtons } from './ExportButtons'

describe('ExportButtons', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    runMock.mockClear()
    viewRef.current = { meta: { customer: 'WHO' } }
  })
  afterEach(() => cleanup())

  it('renders PPTX and HTML buttons when a view is loaded', () => {
    render(<ExportButtons />)
    expect(screen.getByText('Export PPTX')).toBeInTheDocument()
    expect(screen.getByText('Export HTML')).toBeInTheDocument()
  })

  it('calls run with the export kind on click', () => {
    render(<ExportButtons />)
    fireEvent.click(screen.getByText('Export PPTX'))
    expect(runMock).toHaveBeenCalledWith('pptx')
    fireEvent.click(screen.getByText('Export HTML'))
    expect(runMock).toHaveBeenCalledWith('html')
  })

  it('renders nothing when no report is loaded', () => {
    viewRef.current = null
    const { container } = render(<ExportButtons />)
    expect(container).toBeEmptyDOMElement()
  })
})
