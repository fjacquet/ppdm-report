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
  | 'hygiene'
  | 'activity'
  | 'largestBackups'
  | 'slowestBackups'
  | 'sizing'
export const SECTION_ORDER: Record<ExportFlavor, SectionId[]> = {
  assessment: [
    'perServer',
    'sizing',
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
    'hygiene',
    'policies',
    'agentVersions',
    'longestBackups',
    'activity',
    'largestBackups',
    'slowestBackups',
  ],
  ops: [
    'perServer',
    'jobs',
    'activity',
    'reliability',
    'atRisk',
    'longestBackups',
    'largestBackups',
    'slowestBackups',
    'resilience',
    'capacity',
    'capacityTrend',
    'efficiency',
    'hygiene',
    'agentVersions',
    'sizing',
    'coverage',
    'exposure',
    'idle',
    'volumetry',
    'policies',
  ],
}
