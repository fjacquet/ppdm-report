import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import type { ReportView } from '../types/reportView'

const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
}))
vi.mock('../hooks/useExport', () => ({ useExport: () => ({ run: runMock, busy: null }) }))

import { ExportButtons } from './ExportButtons'

const view = { meta: { customer: 'WHO' } } as unknown as ReportView

describe('ExportButtons', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    runMock.mockClear()
  })
  afterEach(() => cleanup())

  it('renders PPTX and HTML buttons when a view is loaded', () => {
    render(<ExportButtons view={view} />)
    expect(screen.getByText('Export PPTX')).toBeInTheDocument()
    expect(screen.getByText('Export HTML')).toBeInTheDocument()
  })

  it('calls run with the export kind on click', () => {
    render(<ExportButtons view={view} />)
    fireEvent.click(screen.getByText('Export PPTX'))
    expect(runMock).toHaveBeenCalledWith('pptx')
    fireEvent.click(screen.getByText('Export HTML'))
    expect(runMock).toHaveBeenCalledWith('html')
  })

  it('renders nothing when no report is loaded', () => {
    const { container } = render(<ExportButtons view={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
