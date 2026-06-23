import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { allAvailable } from '../../engines/aggregation/provenance'
import i18n from '../../i18n'
import type { ReportView, ServerView } from '../../types/reportView'
import { PerServerSection } from './PerServerSection'

function view(pct: number, count: number): ReportView {
  return {
    meta: {
      projectId: '',
      customer: 'ACME',
      collectorBuild: '',
      capturedAt: '2026-03-09',
      baseTen: true,
    },
    inUse: [],
    idleAgents: [],
    warnings: [],
    coverage: {
      byType: {},
      overall: { protected: 1, unprotected: 1, excluded: 0, pct, pctInclExcluded: pct },
    },
    gaps: { count, totalCapacityGb: 1000, top: { items: [], total: count, shown: 0 } },
    jobs: { counts: {}, total: 10, successPct: 0.9, capped: false, windowSize: 10 },
    compliance: {
      appConsistentPct: 0,
      immutablePct: 0,
      replicatedPct: 0,
      appConsistentCount: 0,
      immutableCount: 0,
      replicatedCount: 0,
      backupLevelMix: {},
      windowSize: 0,
      capped: false,
    },
    capacity: { targets: [], flagged: [], mtreeCount: 0 },
    policies: { count: 0, byPurpose: {}, perPolicy: [] },
    frontEnd: { byType: [], excludedCount: 0 },
    provenance: allAvailable(0),
  }
}
const servers: ServerView[] = [
  { label: 'ppdm-paris', version: '19.22', view: view(0.91, 12) },
  { label: 'ppdm-lyon', version: '19.21', view: view(0.82, 19) },
]

describe('PerServerSection', () => {
  beforeEach(async () => await i18n.changeLanguage('en'))
  afterEach(() => cleanup())

  it('renders nothing for a single server', () => {
    const { container } = render(<PerServerSection servers={servers.slice(0, 1)} dark={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a row per server with its label and version', () => {
    render(<PerServerSection servers={servers} dark={false} />)
    expect(screen.getAllByText('ppdm-paris').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ppdm-lyon').length).toBeGreaterThan(0)
    expect(screen.getAllByText('19.22').length).toBeGreaterThan(0)
  })

  it('renders the comparison chart', () => {
    render(<PerServerSection servers={servers} dark={false} />)
    expect(screen.getByTestId('per-server-bars')).toBeInTheDocument()
  })
})
