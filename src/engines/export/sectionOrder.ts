export type ExportFlavor = 'assessment' | 'ops'
export type SectionId =
  | 'perServer'
  | 'coverage'
  | 'gaps'
  | 'idle'
  | 'jobs'
  | 'compliance'
  | 'capacity'
  | 'policies'
export const SECTION_ORDER: Record<ExportFlavor, SectionId[]> = {
  assessment: [
    'perServer',
    'coverage',
    'gaps',
    'idle',
    'jobs',
    'compliance',
    'capacity',
    'policies',
  ],
  ops: ['perServer', 'jobs', 'compliance', 'capacity', 'coverage', 'gaps', 'idle', 'policies'],
}
