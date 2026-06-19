import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { useReportStore } from '../store/reportStore'
import type { ParsedWorkbook } from '../types/ppdm'
import { ServerList } from './ServerList'

const wb: ParsedWorkbook = {
  meta: {
    projectId: '',
    customer: 'ACME',
    collectorBuild: '',
    capturedAt: '2026-03-09',
    baseTen: true,
  },
  sheets: {},
  inUse: [],
  idleAgents: [],
  warnings: [],
}

describe('ServerList', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useReportStore.getState().clear()
  })
  afterEach(() => cleanup())

  it('renders nothing when empty', () => {
    const { container } = render(<ServerList />)
    expect(container.firstChild).toBeNull()
  })

  it('lists loaded server labels', () => {
    useReportStore.getState().addServers([{ label: 'ppdm-paris', workbook: wb }])
    render(<ServerList />)
    expect(screen.getByText('ppdm-paris')).toBeInTheDocument()
  })

  it('removes a server when its remove button is clicked', () => {
    useReportStore.getState().addServers([{ label: 'ppdm-paris', workbook: wb }])
    render(<ServerList />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove ppdm-paris' }))
    expect(useReportStore.getState().servers).toHaveLength(0)
  })

  it('clears all servers', () => {
    useReportStore.getState().addServers([
      { label: 'a', workbook: wb },
      { label: 'b', workbook: wb },
    ])
    render(<ServerList />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(useReportStore.getState().servers).toHaveLength(0)
  })
})
