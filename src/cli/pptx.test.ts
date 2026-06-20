// src/cli/pptx.test.ts

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { summaryWorkbookBuffer } from '../test-helpers/workbooks'
import { runCli } from './pptx'

describe('runCli', () => {
  it('writes a valid .pptx from a PPDM workbook', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ppdm-cli-'))
    const input = join(dir, 'acme.xlsx')
    writeFileSync(input, Buffer.from(summaryWorkbookBuffer()))
    const out = join(dir, 'out.pptx')
    expect(await runCli(['--out', out, '--quiet', input])).toBe(0)
    const bytes = readFileSync(out)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
  })
  it('returns non-zero on a missing file', async () => {
    expect(await runCli(['/no/such/file.xlsx', '--quiet'])).not.toBe(0)
  })
})
