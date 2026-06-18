import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import type { ReportView } from '../../types/reportView'
import { CapacitySection } from './CapacitySection'
import { CoverageSection } from './CoverageSection'
import { ExecutiveKpis } from './ExecutiveKpis'
import { GapsSection } from './GapsSection'
import { IdleAgentsSection } from './IdleAgentsSection'
import { JobsComplianceSection } from './JobsComplianceSection'
import { PoliciesSection } from './PoliciesSection'

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

describe('CoverageSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders section title', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    expect(screen.getByText('Asset Coverage')).toBeInTheDocument()
  })

  it('renders per-type label "SQL Databases"', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    expect(screen.getByText('SQL Databases')).toBeInTheDocument()
  })

  it('renders legend counts for protected / unprotected / excluded', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    expect(screen.getByText('703')).toBeInTheDocument()
    expect(screen.getByText('281')).toBeInTheDocument()
    expect(screen.getByText('377')).toBeInTheDocument()
  })

  it('renders headline pct "71.4%"', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    // fmtPercent(0.714, 'en') → "71.4%"
    expect(screen.getByText('71.4%')).toBeInTheDocument()
  })

  it('renders incl-excluded secondary pct "51.7%"', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    // fmtPercent(0.517, 'en') → "51.7%"
    expect(screen.getByText('51.7%')).toBeInTheDocument()
  })

  it('renders the donut chart (decorative, found by testid)', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    expect(screen.getByTestId('coverage-donut')).toBeInTheDocument()
  })
})

const gapsFixture: ReportView = {
  ...fixture,
  gaps: {
    count: 281,
    totalCapacityGb: 263000,
    top: {
      items: [{ name: 'HR_PAYROLL_PROD', type: 'MSSQL', sizeGb: 842.6 }],
      total: 281,
      shown: 1,
    },
  },
}

describe('GapsSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders the two KPIs', () => {
    render(<GapsSection view={gapsFixture} dark={false} />)
    expect(screen.getByText('263.0 TB')).toBeInTheDocument()
    expect(screen.getAllByText('281').length).toBeGreaterThan(0)
  })

  it('renders the unprotected-by-size bar chart', () => {
    render(<GapsSection view={gapsFixture} dark={false} />)
    expect(screen.getByTestId('gaps-bars')).toBeInTheDocument()
  })

  it('keeps the full list behind a Show details disclosure (asset name + caption present)', () => {
    render(<GapsSection view={gapsFixture} dark={false} />)
    expect(screen.getByText('Show details')).toBeInTheDocument()
    expect(screen.getAllByText('HR_PAYROLL_PROD').length).toBeGreaterThan(0)
    expect(screen.getByText('Top 1 of 281')).toBeInTheDocument()
  })
})

describe('IdleAgentsSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders "Oracle Databases" when idleAgents is non-empty', () => {
    const view: ReportView = {
      ...fixture,
      idleAgents: ['Oracle Databases', 'SAP HANA Databases'],
    }
    render(<IdleAgentsSection view={view} />)
    expect(screen.getByText('Oracle Databases')).toBeInTheDocument()
  })

  it('renders nothing when idleAgents is empty', () => {
    const view: ReportView = { ...fixture, idleAgents: [] }
    const { container } = render(<IdleAgentsSection view={view} />)
    expect(container).toBeEmptyDOMElement()
  })
})

const jobsComplianceFixture: ReportView = {
  ...fixture,
  jobs: {
    counts: { SUCCESS: 9297, RETRIED: 635 },
    total: 10000,
    successPct: 0.93,
    capped: true,
    windowSize: 10000,
  },
  compliance: {
    appConsistentPct: 0.77,
    immutablePct: 0,
    replicatedPct: 0.32,
    capped: true,
    windowSize: 10000,
    backupLevelMix: {},
  },
}

describe('JobsComplianceSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders the job success KPI "93%"', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.getByText('93%')).toBeInTheDocument()
  })

  it('renders the jobs result-mix and compliance bar charts', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.getByTestId('jobs-bars')).toBeInTheDocument()
    expect(screen.getByTestId('compliance-bars')).toBeInTheDocument()
  })

  it('keeps the status counts behind Show details', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.getByText('Show details')).toBeInTheDocument()
    expect(screen.getAllByText('SUCCESS').length).toBeGreaterThan(0)
  })

  it('renders both capped caveats', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.getAllByText(/window, not the full set/i).length).toBeGreaterThanOrEqual(2)
  })
})

const capacityFixture: ReportView = {
  ...fixture,
  capacity: {
    targets: [{ name: 'dd1', type: 'DATA_DOMAIN_SYSTEM', utilizationPct: 87.6, flagged: true }],
    flagged: [{ name: 'dd1', type: 'DATA_DOMAIN_SYSTEM', utilizationPct: 87.6, flagged: true }],
    mtreeCount: 17,
  },
}

describe('CapacitySection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders the mtree count', () => {
    render(<CapacitySection view={capacityFixture} dark={false} />)
    expect(screen.getByText(/17/)).toBeInTheDocument()
  })

  it('renders the utilization bar chart', () => {
    render(<CapacitySection view={capacityFixture} dark={false} />)
    expect(screen.getByTestId('capacity-bars')).toBeInTheDocument()
  })

  it('keeps the targets table behind Show details (name + utilization present)', () => {
    render(<CapacitySection view={capacityFixture} dark={false} />)
    expect(screen.getByText('Show details')).toBeInTheDocument()
    expect(screen.getAllByText('dd1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('87.6 %').length).toBeGreaterThan(0)
    const flaggedRow = document.querySelector('[data-flagged="true"]')
    expect(flaggedRow).not.toBeNull()
  })
})

const policiesFixture: ReportView = {
  ...fixture,
  policies: {
    count: 32,
    byPurpose: { CENTRALIZED: 29, EXCLUSION: 3 },
    perPolicy: [
      {
        name: 'SQL - Prod',
        purpose: 'CENTRALIZED',
        assetCount: 380,
        protectionCapacityGb: 1234.5,
      },
    ],
  },
}

describe('PoliciesSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders total policy count "32 policies"', () => {
    render(<PoliciesSection view={policiesFixture} />)
    expect(screen.getByText('32 policies')).toBeInTheDocument()
  })

  it('renders purpose tally "CENTRALIZED"', () => {
    render(<PoliciesSection view={policiesFixture} />)
    const els = screen.getAllByText('CENTRALIZED')
    expect(els.length).toBeGreaterThan(0)
  })

  it('renders purpose tally count "29"', () => {
    render(<PoliciesSection view={policiesFixture} />)
    expect(screen.getByText('29')).toBeInTheDocument()
  })

  it('renders policy name "SQL - Prod"', () => {
    render(<PoliciesSection view={policiesFixture} />)
    expect(screen.getByText('SQL - Prod')).toBeInTheDocument()
  })
})
