import type { RawWorkbook } from '../../../types/ppdm'
import type { Policies, PolicyRow } from '../../../types/reportView'
import { cellNum, cellStr } from '../../aggregation/rows'

/** Policies (protection groups) from Job List Detailed `Group Name` with per-group
 * distinct-host count + summed capacity; falls back to Group Summary. Pure. */
export function avamarPolicies(wb: RawWorkbook): Policies {
  const jobs = wb.sheets['Job List Detailed']?.rows ?? []
  if (jobs.length > 0) {
    const groups = new Map<string, { hosts: Set<string>; capacityGb: number }>()
    for (const r of jobs) {
      const name = cellStr(r, 'Group Name')
      if (name === '') continue
      const g = groups.get(name) ?? { hosts: new Set<string>(), capacityGb: 0 }
      const host = cellStr(r, 'Host')
      if (host !== '') g.hosts.add(host)
      g.capacityGb += cellNum(r, 'Capacity (GiB)')
      groups.set(name, g)
    }
    const perPolicy: PolicyRow[] = [...groups.entries()].map(([name, g]) => ({
      name,
      purpose: '',
      assetCount: g.hosts.size,
      protectionCapacityGb: g.capacityGb,
    }))
    return { count: groups.size, byPurpose: {}, perPolicy }
  }

  const names = new Set(
    (wb.sheets['Group Summary']?.rows ?? [])
      .map((r) => cellStr(r, 'Group Name'))
      .filter((n) => n !== ''),
  )
  return { count: names.size, byPurpose: {}, perPolicy: [] }
}
