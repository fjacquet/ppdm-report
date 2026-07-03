export type ExportFlavor = 'assessment' | 'ops'
export type SectionId =
  | 'perServer'
  | 'coverage'
  | 'exposure'
  | 'volumetry'
  | 'idle'
  | 'jobs'
  | 'reliability'
  | 'resilience'
  | 'capacity'
  | 'capacityTrend'
  | 'policies'
  | 'atRisk'
  | 'agentVersions'
  | 'longestBackups'
  | 'efficiency'
export const SECTION_ORDER: Record<ExportFlavor, SectionId[]> = {
  assessment: [
    'perServer',
    'coverage',
    'exposure',
    'volumetry',
    'atRisk',
    'idle',
    'jobs',
    'reliability',
    'resilience',
    'capacity',
    'capacityTrend',
    'efficiency',
    'policies',
    'agentVersions',
    'longestBackups',
  ],
  ops: [
    'perServer',
    'jobs',
    'reliability',
    'atRisk',
    'longestBackups',
    'resilience',
    'capacity',
    'capacityTrend',
    'efficiency',
    'agentVersions',
    'coverage',
    'exposure',
    'idle',
    'volumetry',
    'policies',
  ],
}
