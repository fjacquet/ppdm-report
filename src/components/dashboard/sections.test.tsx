import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyActivity } from '../../engines/aggregation/activity'
import type { TrendTarget } from '../../engines/aggregation/capacityTrend'
import { emptyCapacityTrend } from '../../engines/aggregation/capacityTrend'
import { emptyEfficiency } from '../../engines/aggregation/efficiency'
import { emptyHygiene } from '../../engines/aggregation/hygiene'
import { emptyOpsInsights } from '../../engines/aggregation/opsInsights'
import { allAvailable, allUnavailable } from '../../engines/aggregation/provenance'
import { emptyReliability } from '../../engines/aggregation/reliability'
import i18n from '../../i18n'
import type { ReportView } from '../../types/reportView'
import { ActivitySection } from './ActivitySection'
import { CapacitySection } from './CapacitySection'
import { CapacityTrendSection } from './CapacityTrendSection'
import { CoverageSection } from './CoverageSection'
import { EfficiencySection } from './EfficiencySection'
import { ExecutiveKpis } from './ExecutiveKpis'
import { GapsSection } from './GapsSection'
import { HygieneSection } from './HygieneSection'
import { IdleAgentsSection } from './IdleAgentsSection'
import { JobsComplianceSection } from './JobsComplianceSection'
import { PoliciesSection } from './PoliciesSection'
import { ReliabilitySection } from './ReliabilitySection'
import { SizingSection } from './SizingSection'

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
    appConsistentCount: 80,
    immutableCount: 0,
    replicatedCount: 70,
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
  frontEnd: { byType: [], excludedCount: 0 },
  opsInsights: emptyOpsInsights(),
  reliability: emptyReliability(),
  efficiency: emptyEfficiency(),
  capacityTrend: emptyCapacityTrend(),
  hygiene: emptyHygiene(),
  activity: emptyActivity(),
  provenance: allAvailable(0),
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
  afterEach(() => cleanup())

  it('renders all idle agents as tiles', () => {
    const view: ReportView = { ...fixture, idleAgents: ['Oracle Databases', 'SAP HANA Databases'] }
    render(<IdleAgentsSection view={view} />)
    expect(screen.getByText('Oracle Databases')).toBeInTheDocument()
    expect(screen.getByText('SAP HANA Databases')).toBeInTheDocument()
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
    appConsistentCount: 7700,
    immutableCount: 0,
    replicatedCount: 3200,
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
    // the flagged row must keep its amber warning tone (visual signal)
    expect(flaggedRow?.className).toMatch(/amber/)
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
  afterEach(() => cleanup())

  it('renders total policy count "32 policies"', () => {
    render(<PoliciesSection view={policiesFixture} dark={false} />)
    expect(screen.getByText('32 policies')).toBeInTheDocument()
  })

  it('renders the by-purpose bar chart', () => {
    render(<PoliciesSection view={policiesFixture} dark={false} />)
    expect(screen.getByTestId('policies-bars')).toBeInTheDocument()
  })

  it('keeps the by-purpose and per-policy tables behind Show details', () => {
    render(<PoliciesSection view={policiesFixture} dark={false} />)
    expect(screen.getByText('Show details')).toBeInTheDocument()
    expect(screen.getAllByText('CENTRALIZED').length).toBeGreaterThan(0)
    expect(screen.getByText('SQL - Prod')).toBeInTheDocument()
  })
})

// ── Provenance notes (summary-format) ────────────────────────────────────────

const makeView = (overrides: Partial<ReportView>): ReportView => ({ ...fixture, ...overrides })

// ── ExecutiveKpis — compliance provenance gate ────────────────────────────────

describe('ExecutiveKpis — compliance provenance gate', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('shows em-dash for Immutable KPI when compliance provenance is unavailable', () => {
    const view = makeView({
      opsInsights: emptyOpsInsights(),
      provenance: allUnavailable(100),
      compliance: { ...fixture.compliance, immutablePct: 0 },
    })
    render(<ExecutiveKpis view={view} />)
    // "—" must be present (the KpiCard value)
    expect(screen.getByText('—')).toBeInTheDocument()
    // "0%" must NOT appear as the immutable value
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('shows immutable percent when compliance provenance is available', () => {
    const view = makeView({
      opsInsights: emptyOpsInsights(),
      provenance: allAvailable(100),
      compliance: { ...fixture.compliance, immutablePct: 0.42 },
    })
    render(<ExecutiveKpis view={view} />)
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.queryByText('—')).toBeNull()
  })
})

describe('ProvenanceNote integration — summary-format provenance', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('CapacitySection shows the unavailable note for summary provenance', () => {
    const view = makeView({ provenance: allUnavailable(100) })
    render(<CapacitySection view={view} dark={false} />)
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })

  it('JobsComplianceSection shows the unavailable note for summary provenance', () => {
    const view = makeView({ provenance: allUnavailable(100) })
    render(<JobsComplianceSection view={view} dark={false} />)
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })

  it('CoverageSection shows the unavailable note for summary provenance', () => {
    const view = makeView({ provenance: allUnavailable(100) })
    render(<CoverageSection view={view} dark={false} />)
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })

  it('GapsSection shows the unavailable note for summary provenance', () => {
    const view = makeView({ provenance: allUnavailable(100) })
    render(<GapsSection view={view} dark={false} />)
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })

  it('CapacitySection shows NO provenance note when fully available', () => {
    render(<CapacitySection view={capacityFixture} dark={false} />)
    expect(screen.queryByText(/not available/i)).toBeNull()
  })

  it('JobsComplianceSection shows NO provenance note when fully available', () => {
    render(<JobsComplianceSection view={jobsComplianceFixture} dark={false} />)
    expect(screen.queryByText(/not available/i)).toBeNull()
  })

  it('CoverageSection shows NO provenance note when fully available', () => {
    render(<CoverageSection view={fixture} dark={false} />)
    expect(screen.queryByText(/not available/i)).toBeNull()
  })

  it('GapsSection shows NO provenance note when fully available', () => {
    render(<GapsSection view={gapsFixture} dark={false} />)
    expect(screen.queryByText(/not available/i)).toBeNull()
  })

  it('CoverageSection shows partial note when coverageByType covers 1 of 2 servers', () => {
    const view = makeView({
      opsInsights: emptyOpsInsights(),
      provenance: {
        ...allAvailable(100),
        coverageByType: { available: true, serversCovered: 1, serversTotal: 2 },
      },
    })
    render(<CoverageSection view={view} dark={false} />)
    // expect the partial string "Covers 1 of 2 servers"
    expect(screen.getByText(/covers 1 of 2 servers/i)).toBeInTheDocument()
  })

  it('JobsComplianceSection shows partialAssets note when compliance covers 1 of 2 servers with assets', () => {
    const view = makeView({
      opsInsights: emptyOpsInsights(),
      provenance: {
        ...allAvailable(3886),
        compliance: {
          available: true,
          serversCovered: 1,
          serversTotal: 2,
          assetsCovered: 370,
          assetsTotal: 3886,
        },
      },
    })
    render(<JobsComplianceSection view={view} dark={false} />)
    // expect the partialAssets string containing server counts and asset counts
    expect(screen.getByText(/covers 1 of 2 servers/i)).toBeInTheDocument()
    expect(screen.getByText(/370 of 3886 assets/i)).toBeInTheDocument()
  })
})

describe('ReliabilitySection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders the repeat-failure table', () => {
    const view = makeView({
      reliability: {
        repeatFailures: {
          items: [{ host: 'bad-client', failureDays: 4, failedJobs: 9, daysSinceSuccess: 2 }],
          total: 1,
          shown: 1,
        },
        runtime: { le15m: 0, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 0 },
        runtimeTotal: 0,
        windowStart: '2026-06-01',
        windowEnd: '2026-06-30',
        capped: false,
      },
    })
    render(<ReliabilitySection view={view} />)
    expect(screen.getByText('bad-client')).toBeTruthy()
  })

  it('renders nothing when there are no repeat failures', () => {
    const view = makeView({ reliability: emptyReliability() })
    const { container } = render(<ReliabilitySection view={view} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('HygieneSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders an unused-dataset item and an expired license status', () => {
    const view = makeView({
      hygiene: {
        items: [
          { kind: 'datasetUnused', name: 'stale-dataset', detail: 'no clients' },
          { kind: 'license', name: 'PPDM-License', licenseStatus: 'expired' },
        ],
        countByKind: {
          datasetUnused: 1,
          retentionUnused: 0,
          scheduleUnused: 0,
          clientInactive: 0,
          clientOvertime: 0,
          license: 1,
        },
        cleanupTotal: 1,
        expiredLicenses: 1,
        expiringLicenses: 0,
      },
    })
    render(<HygieneSection view={view} />)
    expect(screen.getByText('stale-dataset')).toBeTruthy()
    expect(screen.getByText('Expired')).toBeTruthy()
  })

  it('renders nothing when hygiene is empty', () => {
    const view = makeView({ hygiene: emptyHygiene() })
    const { container } = render(<HygieneSection view={view} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('caps the table at 25 rows and shows a 25/30 caption for a 30-item estate', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      kind: 'datasetUnused' as const,
      name: `stale-dataset-${i}`,
      detail: 'no clients',
    }))
    const view = makeView({
      hygiene: {
        items,
        countByKind: {
          datasetUnused: 30,
          retentionUnused: 0,
          scheduleUnused: 0,
          clientInactive: 0,
          clientOvertime: 0,
          license: 0,
        },
        cleanupTotal: 30,
        expiredLicenses: 0,
        expiringLicenses: 0,
      },
    })
    render(<HygieneSection view={view} />)
    expect(screen.getAllByText('no clients')).toHaveLength(25)
    expect(screen.getByText('Top 25 of 30.')).toBeTruthy()
  })
})

describe('EfficiencySection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders retention rows and low-dedupe clients', () => {
    const view = makeView({
      efficiency: {
        dedupe: {
          common: { num: 9200, den: 100 },
          lowDedupe: {
            items: [{ host: 'poor', commonPct: 20, processedGb: 5 }],
            total: 1,
            shown: 1,
          },
        },
        retention: {
          totalGbByBucket: { r30: 100, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
          perPolicyType: [
            { type: 'SQL', gbByBucket: { r30: 100, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 } },
          ],
        },
      },
    })
    render(<EfficiencySection view={view} />)
    expect(screen.getByText('SQL')).toBeTruthy()
    expect(screen.getByText('poor')).toBeTruthy()
  })

  it('renders nothing when efficiency is empty', () => {
    const { container } = render(
      <EfficiencySection view={makeView({ efficiency: emptyEfficiency() })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

const trendTargets: TrendTarget[] = [
  {
    target: 'dd-grid-01',
    currentPct: 78,
    minPct: 60,
    maxPct: 78,
    windowStart: '2026-05-01',
    windowEnd: '2026-06-30',
    sampleCount: 45,
    slopePer30d: 2.5,
    series: [
      ['2026-05-01', 60],
      ['2026-06-01', 69],
      ['2026-06-30', 78],
    ],
  },
  {
    target: 'dd-grid-02',
    currentPct: 42,
    minPct: 40,
    maxPct: 43,
    windowStart: '2026-05-01',
    windowEnd: '2026-06-30',
    sampleCount: 45,
    slopePer30d: undefined,
    series: [
      ['2026-05-01', 40],
      ['2026-06-30', 42],
    ],
  },
]

describe('CapacityTrendSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders the fastest-growing target name and its slope in the takeaway', () => {
    const view = makeView({ capacityTrend: { targets: trendTargets } })
    render(<CapacityTrendSection view={view} dark={false} />)
    expect(screen.getAllByText(/dd-grid-01/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Fastest-growing target.*2\.5/)).toBeInTheDocument()
  })

  it('renders "n/a" for a target with no computed slope', () => {
    const view = makeView({ capacityTrend: { targets: trendTargets } })
    render(<CapacityTrendSection view={view} dark={false} />)
    expect(screen.getByText('n/a')).toBeInTheDocument()
  })

  it('renders nothing when capacityTrend has no targets', () => {
    const view = makeView({ capacityTrend: emptyCapacityTrend() })
    const { container } = render(<CapacityTrendSection view={view} dark={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('JobsComplianceSection — replication health', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('shows the replication health block when replicationHealth is present', () => {
    const view = makeView({
      ...jobsComplianceFixture,
      efficiency: {
        replicationHealth: {
          counts: { success: 40, exceptions: 2, partial: 3, cancelled: 1, failed: 4 },
          total: 50,
        },
      },
    })
    render(<JobsComplianceSection view={view} dark={false} />)
    expect(screen.getByText('Replication health')).toBeInTheDocument()
    expect(
      screen.getByText('7 of 50 replication activities failed or were partial'),
    ).toBeInTheDocument()
  })
})

const populatedActivity = {
  byType: [
    { type: 'FILESYSTEM', capacityGb: 100, clients: 3, files: 900 },
    {
      type: 'VIRTUAL_MACHINES',
      capacityGb: 40,
      clients: 1,
      files: 10,
      changeRate: { num: 5, den: 50 },
    },
  ],
  largest: {
    items: [
      { host: 'big1', type: 'FILESYSTEM', sizeGb: 80, files: 500 },
      { host: 'big2', type: 'VIRTUAL_MACHINES', sizeGb: 40 },
    ],
    total: 2,
    shown: 2,
  },
  slowest: {
    items: [{ host: 'slow1', type: 'FILESYSTEM', throughputMbSec: 3.2, sizeGb: 12 }],
    total: 1,
    shown: 1,
  },
  daily: [
    { day: '2026-06-15', gb: 10, jobs: 2 },
    { day: '2026-06-17', gb: 5, jobs: 1 },
    { day: '2026-06-22', gb: 8, jobs: 3 },
  ],
  osSplit: { counts: { Windows: 4, Linux: 2, Other: 1 } },
}

const activityProvenance = {
  ...allAvailable(0),
  activity: { available: true, serversCovered: 1, serversTotal: 1 },
}

describe('ActivitySection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  it('renders nothing when the activity metric is unavailable', () => {
    const view = makeView({ activity: populatedActivity, provenance: allAvailable(0) })
    const { container } = render(<ActivitySection view={view} dark={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when activity is available but empty', () => {
    const view = makeView({ activity: emptyActivity(), provenance: activityProvenance })
    const { container } = render(<ActivitySection view={view} dark={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the takeaway, per-type table, and largest/slowest tables', () => {
    const view = makeView({ activity: populatedActivity, provenance: activityProvenance })
    render(<ActivitySection view={view} dark={false} />)
    expect(screen.getByText('23.0 GB transferred across 6 jobs in the window')).toBeInTheDocument()
    expect(screen.getAllByText('FILESYSTEM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('VIRTUAL_MACHINES').length).toBeGreaterThan(0)
    expect(screen.getAllByText('10%').length).toBeGreaterThan(0) // change rate for VIRTUAL_MACHINES
    expect(screen.getByText('big1')).toBeInTheDocument()
    expect(screen.getByText('slow1')).toBeInTheDocument()
    expect(screen.getByText(/Only backups ≥ 1 GiB rank for throughput/)).toBeInTheDocument()
  })

  it('renders the daily trend chart and OS split bars', () => {
    const view = makeView({ activity: populatedActivity, provenance: activityProvenance })
    render(<ActivitySection view={view} dark={false} />)
    expect(screen.getByTestId('activity-daily-chart')).toBeInTheDocument()
    expect(screen.getByTestId('activity-os-bars')).toBeInTheDocument()
  })

  it('omits the OS bars when osSplit is absent', () => {
    const view = makeView({
      activity: { ...populatedActivity, osSplit: undefined },
      provenance: activityProvenance,
    })
    render(<ActivitySection view={view} dark={false} />)
    expect(screen.queryByTestId('activity-os-bars')).toBeNull()
  })
})

describe('SizingSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => cleanup())

  const fullyAvailableProvenance = {
    ...allAvailable(0),
    reliability: { available: true, serversCovered: 1, serversTotal: 1 },
    efficiency: { available: true, serversCovered: 1, serversTotal: 1 },
    capacityTrend: { available: true, serversCovered: 1, serversTotal: 1 },
    hygiene: { available: true, serversCovered: 1, serversTotal: 1 },
  }

  it('renders the metric/value/basis table when every family is populated', () => {
    const view = makeView({
      provenance: fullyAvailableProvenance,
      frontEnd: { byType: [{ type: 'SQL', protectedFetbGb: 100 }], excludedCount: 0 },
      efficiency: {
        changeRate: { sentBytes: 10, processedBytes: 100 },
        dedupe: { common: { num: 9200, den: 100 }, lowDedupe: { items: [], total: 0, shown: 0 } },
        retention: {
          totalGbByBucket: { r30: 10, r60: 20, r180: 0, r1y: 5, r7y: 3, r7yPlus: 2 },
          perPolicyType: [],
        },
      },
      capacityTrend: {
        targets: [
          {
            target: 'dd1',
            currentPct: 70,
            minPct: 40,
            maxPct: 70,
            windowStart: '2026-05-01',
            windowEnd: '2026-06-30',
            sampleCount: 60,
            slopePer30d: 2.5,
            series: [],
          },
        ],
      },
      reliability: {
        repeatFailures: { items: [], total: 0, shown: 0 },
        runtime: { le15m: 0, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 4 },
        runtimeTotal: 4,
        queue: {
          delayedCount: 20,
          total: 100,
          delayedPct: 0.2,
          top: { items: [], total: 0, shown: 0 },
        },
        capped: false,
      },
      hygiene: {
        items: [{ kind: 'clientInactive', name: 'c1' }],
        countByKind: {
          datasetUnused: 0,
          retentionUnused: 0,
          scheduleUnused: 0,
          clientInactive: 1,
          clientOvertime: 0,
          license: 0,
        },
        cleanupTotal: 1,
        expiredLicenses: 0,
        expiringLicenses: 0,
      },
    })
    render(<SizingSection view={view} />)
    expect(screen.getByText('Sizing inputs')).toBeInTheDocument()
    expect(screen.getByText('Protected front-end capacity')).toBeInTheDocument()
    expect(screen.getByText('100.0 GB')).toBeInTheDocument()
    expect(screen.getByText('Daily change rate')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getByText('Dedupe commonality')).toBeInTheDocument()
    expect(screen.getByText('Inactive clients (consider netting out)')).toBeInTheDocument()
    expect(screen.getAllByText('measured').length).toBeGreaterThan(0)
    expect(screen.getAllByText('observed').length).toBeGreaterThan(0)
  })

  it('renders nothing when no sizing family is available', () => {
    const view = makeView({ provenance: allUnavailable(0) })
    const { container } = render(<SizingSection view={view} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders only the rows backed by populated families (sparse view)', () => {
    const view = makeView({
      provenance: {
        ...allAvailable(0),
        efficiency: { available: true, serversCovered: 1, serversTotal: 1 },
      },
      efficiency: {
        changeRate: { sentBytes: 10, processedBytes: 100 },
      },
    })
    render(<SizingSection view={view} />)
    expect(screen.getByText('Daily change rate')).toBeInTheDocument()
    expect(screen.queryByText('Protected front-end capacity')).toBeNull()
    expect(screen.queryByText('Dedupe commonality')).toBeNull()
    expect(screen.queryByText('Fastest utilization growth')).toBeNull()
    expect(screen.queryByText('Inactive clients (consider netting out)')).toBeNull()
  })
})
