import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import type { ReportView } from '../../types/reportView'
import { ExecutiveKpis } from './ExecutiveKpis'

const fixture: ReportView = {
  meta: {
    projectId: 'test-project',
    customer: 'Test Customer',
    collectorBuild: '19.15',
    capturedAt: '2026-01-01',
    baseTen: true,
  },
  inUse: [],
  idleAgents: [],
  warnings: [],
  coverage: {
    byType: {},
    overall: {
      protected: 703,
      unprotected: 281,
      excluded: 377,
      pct: 0.714,
      pctInclExcluded: 0.517,
    },
  },
  gaps: {
    count: 281,
    totalCapacityGb: 263000,
    top: { items: [], total: 281, shown: 0 },
  },
  jobs: {
    counts: {},
    total: 100,
    successPct: 0.93,
    capped: false,
    windowSize: 100,
  },
  compliance: {
    appConsistentPct: 0.8,
    immutablePct: 0,
    replicatedPct: 0.7,
    backupLevelMix: {},
    windowSize: 100,
    capped: false,
  },
  capacity: {
    targets: [],
    flagged: [],
    mtreeCount: 0,
  },
  policies: {
    count: 0,
    byPurpose: {},
    perPolicy: [],
  },
}

describe('ExecutiveKpis', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders coverage percent', () => {
    render(<ExecutiveKpis view={fixture} />)
    // fmtPercent(0.714, 'en') → "71.4%"
    expect(screen.getByText('71.4%')).toBeInTheDocument()
  })

  it('renders unprotected capacity in TB', () => {
    render(<ExecutiveKpis view={fixture} />)
    // formatBytes(263000 * 1e9, 'en') → "263.0 TB"
    expect(screen.getByText('263.0 TB')).toBeInTheDocument()
  })

  it('renders job success percent', () => {
    render(<ExecutiveKpis view={fixture} />)
    // fmtPercent(0.93, 'en') → "93%"
    expect(screen.getByText('93%')).toBeInTheDocument()
  })

  it('renders immutable 0% with bad/red tone class', () => {
    render(<ExecutiveKpis view={fixture} />)
    // fmtPercent(0, 'en') → "0%" — target specifically by label then assert sibling value
    const immutableLabel = screen.getByText('Immutable')
    const valueEl = immutableLabel.previousElementSibling
    expect(valueEl?.textContent).toBe('0%')
    // The immutable card should have a red border class (bad tone)
    const redBorder = document.querySelector('.border-red-500')
    expect(redBorder).not.toBeNull()
  })

  it('renders all 4 KPI cards', () => {
    render(<ExecutiveKpis view={fixture} />)
    expect(screen.getByText('Coverage')).toBeInTheDocument()
    expect(screen.getByText('Unprotected')).toBeInTheDocument()
    expect(screen.getByText('Job success rate')).toBeInTheDocument()
    expect(screen.getByText('Immutable')).toBeInTheDocument()
  })
})
