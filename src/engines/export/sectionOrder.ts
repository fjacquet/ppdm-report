export type ExportFlavor = 'assessment' | 'ops'
export type SectionId =
  | 'coverage'
  | 'gaps'
  | 'idle'
  | 'jobs'
  | 'compliance'
  | 'capacity'
  | 'policies'
export const SECTION_ORDER: Record<ExportFlavor, SectionId[]> = {
  assessment: ['coverage', 'gaps', 'idle', 'jobs', 'compliance', 'capacity', 'policies'],
  ops: ['jobs', 'compliance', 'capacity', 'coverage', 'gaps', 'idle', 'policies'],
}
