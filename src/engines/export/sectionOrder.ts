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
  | 'policies'
  | 'atRisk'
  | 'agentVersions'
  | 'longestBackups'
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
    'agentVersions',
    'coverage',
    'exposure',
    'idle',
    'volumetry',
    'policies',
  ],
}
