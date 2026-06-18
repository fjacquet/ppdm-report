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

  it('renders aria-label on the donut chart', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    expect(screen.getByRole('img', { name: /coverage donut/i })).toBeInTheDocument()
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

  afterEach(() => {
    cleanup()
  })

  it('renders total unprotected capacity as "263.0 TB"', () => {
    render(<GapsSection view={gapsFixture} />)
    expect(screen.getByText('263.0 TB')).toBeInTheDocument()
  })

  it('renders unprotected asset count "281"', () => {
    render(<GapsSection view={gapsFixture} />)
    expect(screen.getAllByText('281').length).toBeGreaterThan(0)
  })

  it('renders top-of caption via common:topOf', () => {
    render(<GapsSection view={gapsFixture} />)
    expect(screen.getByText('Top 1 of 281')).toBeInTheDocument()
  })

  it('renders asset name "HR_PAYROLL_PROD" in the table', () => {
    render(<GapsSection view={gapsFixture} />)
    expect(screen.getByText('HR_PAYROLL_PROD')).toBeInTheDocument()
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

  afterEach(() => {
    cleanup()
  })

  it('renders job success percent "93%"', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} />)
    expect(screen.getByText('93%')).toBeInTheDocument()
  })

  it('renders the jobs capped caveat containing the window size', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} />)
    // common:capped with n=10000 → "Based on most recent 10,000 — a window, not the full set"
    const cappedEls = screen.getAllByText(/10[,.]?000/)
    expect(cappedEls.length).toBeGreaterThan(0)
  })

  it('renders immutable "0%" with a bad/red tone class', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
    const redBorder = document.querySelector('.border-red-500, .border-red-400')
    expect(redBorder).not.toBeNull()
  })

  it('renders compliance capped caveat', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} />)
    const cappedEls = screen.getAllByText(/window, not the full set/i)
    expect(cappedEls.length).toBeGreaterThan(0)
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

  afterEach(() => {
    cleanup()
  })

  it('renders target name "dd1"', () => {
    render(<CapacitySection view={capacityFixture} />)
    expect(screen.getByText('dd1')).toBeInTheDocument()
  })

  it('renders utilization "87.6 %"', () => {
    render(<CapacitySection view={capacityFixture} />)
    expect(screen.getByText('87.6 %')).toBeInTheDocument()
  })

  it('renders flagged row with a warn/bad tone class', () => {
    render(<CapacitySection view={capacityFixture} />)
    const flaggedRow = document.querySelector('[data-flagged="true"]')
    expect(flaggedRow).not.toBeNull()
    expect(flaggedRow?.className).toMatch(/amber|red|warn/)
  })

  it('renders mtree count "17"', () => {
    render(<CapacitySection view={capacityFixture} />)
    expect(screen.getByText(/17/)).toBeInTheDocument()
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

  it('renders total policy count "32"', () => {
    render(<PoliciesSection view={policiesFixture} />)
    expect(screen.getByText('32')).toBeInTheDocument()
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
