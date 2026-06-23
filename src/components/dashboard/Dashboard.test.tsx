import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyOpsInsights } from '../../engines/aggregation/opsInsights'
import { allAvailable } from '../../engines/aggregation/provenance'
import i18n from '../../i18n'
import { useReportStore } from '../../store/reportStore'
import type { ReportView } from '../../types/reportView'
import { Dashboard } from './Dashboard'

const fixture: ReportView = {
  meta: {
    projectId: 'test-project',
    customer: 'Test Customer',
    collectorBuild: '19.15',
    capturedAt: '2026-01-01',
    baseTen: true,
  },
  inUse: [],
  idleAgents: ['Oracle Databases'],
  warnings: [],
  coverage: {
    byType: {
      'SQL Databases': {
        protected: 380,
        unprotected: 150,
        excluded: 224,
        pct: 0.717,
        pctInclExcluded: 0.501,
      },
    },
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
    appConsistentCount: 80,
    immutableCount: 0,
    replicatedCount: 70,
    backupLevelMix: {},
    windowSize: 100,
    capped: false,
  },
  capacity: {
    targets: [{ name: 'dd1', type: 'DATA_DOMAIN_SYSTEM', utilizationPct: 87.6, flagged: true }],
    flagged: [{ name: 'dd1', type: 'DATA_DOMAIN_SYSTEM', utilizationPct: 87.6, flagged: true }],
    mtreeCount: 17,
  },
  policies: {
    count: 32,
    byPurpose: { CENTRALIZED: 29 },
    perPolicy: [
      { name: 'SQL - Prod', purpose: 'CENTRALIZED', assetCount: 380, protectionCapacityGb: 1234.5 },
    ],
  },
  frontEnd: { byType: [], excludedCount: 0 },
  opsInsights: emptyOpsInsights(),
  provenance: allAvailable(0),
}

describe('Dashboard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
    useReportStore.getState().setFlavor('assessment')
  })

  it('renders KPIs and every section with the assessment flavor', () => {
    useReportStore.getState().setFlavor('assessment')
    render(<Dashboard view={fixture} />)

    // Executive KPI cards (always first)
    expect(screen.getByText('Coverage')).toBeInTheDocument()
    expect(screen.getByText('Job success rate')).toBeInTheDocument()

    // One distinctive datum from each section confirms it rendered.
    expect(screen.getByText('Asset Coverage')).toBeInTheDocument() // CoverageSection
    expect(screen.getAllByText('263.0 TB').length).toBeGreaterThan(0) // GapsSection (also a KPI)
    expect(screen.getByText('Oracle Databases')).toBeInTheDocument() // IdleAgentsSection
    expect(screen.getAllByText('dd1').length).toBeGreaterThan(0) // CapacitySection (chart axis + table)
    expect(screen.getByText('SQL - Prod')).toBeInTheDocument() // PoliciesSection
    expect(screen.getAllByText('93%').length).toBeGreaterThan(0) // Jobs/Compliance (also a KPI)
  })

  it('still renders every section after switching to the ops flavor', () => {
    useReportStore.getState().setFlavor('ops')
    render(<Dashboard view={fixture} />)

    expect(screen.getByText('Coverage')).toBeInTheDocument()
    expect(screen.getByText('Asset Coverage')).toBeInTheDocument()
    expect(screen.getByText('Oracle Databases')).toBeInTheDocument()
    expect(screen.getAllByText('dd1').length).toBeGreaterThan(0)
    expect(screen.getByText('SQL - Prod')).toBeInTheDocument()
  })
})
