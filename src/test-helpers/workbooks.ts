import * as XLSX from 'xlsx'
import type { Cell } from '../types/ppdm'

/**
 * Build an .xlsx ArrayBuffer from a sheet-name → array-of-arrays map.
 *
 * Mirrors the house pattern in `normalizeWorkbook.test.ts`; shared here so the
 * ref/-dependent tests can run against synthetic, always-available workbooks
 * (the real CHUV `.xlsx` fixtures under `ref/` are gitignored and absent in CI).
 */
export function makeWorkbook(sheets: Record<string, Cell[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/**
 * Synthetic SUMMARY-format workbook (Field/Value sheets, `System Configuration`
 * + `... Count And Cap` sheets), mirroring older Live Optics summary exports.
 * `detectFormat` classifies it as 'summary'.
 */
export function summaryWorkbookBuffer(): ArrayBuffer {
  return makeWorkbook({
    Details: [
      ['Project Name', 'CHUV-test'],
      ['Date', '18/02/2025 03:54:24'],
      ['Disclaimer', 'All measurements ... Base 10 ...'],
    ],
    'System Configuration': [
      ['Field', 'Value'],
      ['Assets Count', 100],
      ['Number of Protected Assets', 80],
      ['Number of UnProtected Assets', 15],
    ],
    'VMs Count And Cap': [
      ['Field', 'Value'],
      ['VM Asset Count', 60],
      ['VM Capacity Unprotected Assets (GB)', 1234.5],
    ],
    'SQL DBs Count & Cap': [
      ['Field', 'Value'],
      ['SQL DB Asset Count', 0],
      ['SQL DB Capacity Unprotected Assets (GB)', 0],
    ],
    'FileSystem Assets Count & Cap': [
      ['Field', 'Value'],
      ['File System Asset Count', 10],
      ['File System Capacity Unprotected Assets (GB)', 0],
    ],
    'Jobs Summary': [
      [
        'Job Type',
        'Successful Jobs',
        'Failed Jobs',
        'Cancelled',
        'Ok with Errors',
        'Unknown',
        'Skipped',
      ],
      ['Protect', 90, 10, 0, 0, 0, 0],
      ['Replicate', 5, 0, 0, 0, 0, 0],
    ],
    Policies: [
      ['Name', 'Category', 'Number of Assets', 'Total Asset Protection Capacity (GB)'],
      ['pol1', 'CENTRALIZED_PROTECTION', 60, 500],
    ],
    'Data Domain Mtrees': [['Name'], ['mt1'], ['mt2']],
  })
}

/**
 * Synthetic DETAIL-format workbook (column-keyed per-asset sheets, NO
 * `System Configuration`), mirroring current Live Optics per-asset exports.
 * `detectFormat` classifies it as 'detail'. Exercises all six detail engines
 * with non-trivial, integer-keyed data for exact assertions.
 */
export function detailWorkbookBuffer(): ArrayBuffer {
  return makeWorkbook({
    Details: [
      ['Project Name', 'Detail-test'],
      ['Date', 45000],
    ],
    'System Information': [
      ['Host IP', 'Host Name', 'PowerProtect Version', 'Last Updated', 'Uptime (Days)'],
      ['10.0.0.1', 'detailhost', '19.19', 'x', 90],
    ],
    'Virtual Machines': [
      ['Asset Name', 'Protection Status'],
      ['vm1', 'PROTECTED'],
      ['vm2', 'UNPROTECTED'],
      ['vm3', 'EXCLUDED'],
    ],
    Copies: [
      ['Data Consistency', 'Lock Status', 'Replica', 'Backup Level'],
      ['APPLICATION_CONSISTENT', 'GOVERNANCE', 'TRUE', 'FULL'],
      ['CRASH_CONSISTENT', 'ALL_COPIES_UNLOCKED', 'FALSE', 'INCREMENTAL'],
    ],
    'Unprotected Assets': [
      ['Name', 'Type', 'Size (GB)'],
      ['ua1', 'VM', 100],
      ['ua2', 'FS', 50],
    ],
    'Storage Targets': [
      ['Name', 'Type', 'Utilization (%)'],
      ['st1', 'DD', 85],
      ['st2', 'DD', 50],
    ],
    'Data Domain Mtrees': [['Name'], ['m1'], ['m2']],
    Policies: [
      ['Name', 'Purpose', 'Number of Assets', 'Total Asset Protection Capacity (GB)'],
      ['p1', 'CENTRALIZED', 3, 300],
    ],
    'Protection Job Activities': [['Result'], ['SUCCESS'], ['SUCCESS'], ['FAILED']],
  })
}

/**
 * Synthetic NETWORKER workbook (System Info, Clients, Jobs, Data Domains, Front
 * End Capacity by Workload, Policies, Devices Detailed, Backups, Dedup Jobs +
 * the Storage Nodes/Dedup Jobs detection signature), mirroring a Dell NetWorker
 * Live Optics export.
 */
export function networkerWorkbookBuffer(): ArrayBuffer {
  return makeWorkbook({
    Details: [
      ['Project Name', 'NW-test'],
      ['Date', 45000],
      ['Disclaimer #1', 'All measurements on the report are Base 10 calculations'],
    ],
    'System Info': [
      ['Metric', 'Value'],
      ['NetWorker Version', 'NetWorker 19.13.0.2'],
      ['Server Hostname', 'nw-host'],
    ],
    'Storage Nodes': [['Name'], ['nw-host']],
    'Dedup Jobs': [
      ['Hostname', 'Mtree Name'],
      ['nw-host', 'Index'],
      ['nw-host', 'Filesystem'],
      ['nw-host', 'Index'],
    ],
    Clients: [
      ['Hostname', 'Scheduled Backup', 'Backup Type'],
      ['c1', 'True', 'Filesystem'],
      ['c2', 'True', 'Oracle'],
      ['c3', 'False', 'Filesystem'],
    ],
    Jobs: [['Completion Status'], ['Succeeded'], ['Succeeded'], ['Succeeded'], ['Failed']],
    'Data Domains': [
      ['Name', 'Model', 'Used Capacity (GB)', 'Total Capacity (GB)'],
      ['dd1', 'DD6400', 73000, 164000],
      ['dd2', 'DD9400', 90, 100],
    ],
    'Front End Capacity by Workload': [
      ['Workload Type', 'Front End Capacity (GB)'],
      ['Filesystem', 410],
      ['Oracle RMAN', 30598],
      ['SQL', 0],
      ['VMware', 0],
    ],
    Policies: [['Policy Name'], ['Bronze'], ['Bronze'], ['Silver']],
    'Devices Detailed': [
      ['Dev Name', 'DD Retention Lock Mode'],
      ['d1', 'None'],
      ['d2', 'Compliance'],
    ],
    Backups: [
      ['Backup Type', 'Backup Level', 'Clone Status'],
      ['Filesystem', 'Incr', 'N/A'],
      ['Oracle', 'Full', 'Cloned'],
      ['Filesystem', 'Full', 'N/A'],
    ],
  })
}

/**
 * Synthetic AVAMAR workbook (Backup Completion Summary, NonRetired/Retired
 * client counts, Clients No Backups, Backup Plugins, Node Utilization, Disabled
 * Groups, Group Summary), mirroring a Dell Avamar Live Optics export.
 */
export function avamarWorkbookBuffer(): ArrayBuffer {
  return makeWorkbook({
    Details: [
      ['Project Name', 'AVA-test'],
      ['Date', 45000],
      ['Disclaimer', 'All measurements ... Base 2 units of Measurement.'],
    ],
    'Host Info': [
      ['Hostname', 'Serial'],
      ['ava-host', 'SN1'],
    ],
    'Avamar DPN Summary': [
      ['Server', 'Host', 'Status'],
      ['ava-host', 'h1', 'Activity completed successfully.'],
    ],
    'Backup Completion Summary': [
      ['Total', 'Successful', 'Exception', 'Failed'],
      [10, 7, 1, 2],
    ],
    'NonRetired Clients With Backups': [
      ['Has Backups', 'Total'],
      ['False', 4],
      ['True', 6],
    ],
    'Retired Clients With Backups': [
      ['Has Backups', 'Total'],
      ['False', 2],
      ['True', 1],
    ],
    'Clients No Backups': [
      ['Full Domain', 'Client Type', 'Completed Time'],
      ['/clients/a', 'REGULAR', 25569],
      ['/clients/b', 'VREGULAR', 25569],
    ],
    'Backup Plugins': [
      ['Plugin Name', 'Count'],
      ['Linux VMware Image', 5],
      ['No Plug-in', 0],
    ],
    'Node Utilization': [
      ['Date', 'Node', 'Max Utilization (%)'],
      [45000, 0, 0.5],
      [45001, 0, 0.8],
      [45001, 1, 0.5],
    ],
    'Disabled Groups': [
      ['Domain', 'Name', 'Read Only'],
      ['/', 'Default Group', 'False'],
      ['/dc1', 'Default Virtual Machine Group', 'False'],
    ],
    'Group Summary': [
      ['Group Name', 'Total', 'Successful', 'Exception', 'Failed'],
      ['G1', 2, 2, 0, 0],
      ['G1', 2, 2, 0, 0],
      ['G2', 1, 1, 0, 0],
    ],
  })
}
