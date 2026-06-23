import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarWorkloads } from './workloads'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('avamarWorkloads', () => {
  it('distinct Policy Type from Job List Detailed backups, excluding GC and No Plug-in', () => {
    const list = avamarWorkloads(
      wb({
        'Job List Detailed': [
          ['Policy Type', 'Job Type'],
          ['Linux VMware Image', 'Backup'],
          ['Windows File System', 'Backup'],
          ['Linux VMware Image', 'Backup'],
          ['GC', 'GC'],
          ['No Plug-in', 'Backup'],
        ],
      }),
    )
    expect(list).toEqual(['Linux VMware Image', 'Windows File System'])
  })

  it('falls back to Backup Plugins (Count > 0) when no detail sheet', () => {
    const list = avamarWorkloads(
      wb({
        'Backup Plugins': [
          ['Plugin Name', 'Count'],
          ['Linux VMware Image', 5],
          ['No Plug-in', 0],
        ],
      }),
    )
    expect(list).toEqual(['Linux VMware Image'])
  })
})
