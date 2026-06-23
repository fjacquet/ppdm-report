export type ExportFlavor = 'assessment' | 'ops'
export type SectionId =
  | 'perServer'
  | 'coverage'
  | 'exposure'
  | 'volumetry'
  | 'idle'
  | 'jobs'
  | 'resilience'
  | 'capacity'
  | 'policies'
export const SECTION_ORDER: Record<ExportFlavor, SectionId[]> = {
  assessment: [
    'perServer',
    'coverage',
    'exposure',
    'volumetry',
    'idle',
    'jobs',
    'resilience',
    'capacity',
    'policies',
  ],
  ops: [
    'perServer',
    'jobs',
    'resilience',
    'capacity',
    'coverage',
    'exposure',
    'idle',
    'volumetry',
    'policies',
  ],
}
