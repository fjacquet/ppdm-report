import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { buildExportModel } from '../engines/export/buildExportModel'
import { buildPptx } from '../engines/export/pptx/builder'
import { ingestReport } from '../engines/ingestReport'
import type { ProductId } from '../types/ppdm'
import { createReportT } from './i18n'

const SLUG: Record<ProductId, string> = {
  ppdm: 'ppdm',
  avamar: 'avamar',
  networker: 'networker',
  unknown: 'report',
}

interface Args {
  input?: string
  out?: string
  lang: string
  theme: 'light' | 'dark'
  flavor: 'assessment' | 'ops'
  quiet: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { lang: 'en', theme: 'light', flavor: 'assessment', quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x === '--out') a.out = argv[++i]
    else if (x === '--lang') a.lang = argv[++i] ?? 'en'
    else if (x === '--theme') a.theme = argv[++i] === 'dark' ? 'dark' : 'light'
    else if (x === '--flavor') a.flavor = argv[++i] === 'ops' ? 'ops' : 'assessment'
    else if (x === '--quiet') a.quiet = true
    else if (x && !x.startsWith('-')) a.input = x
  }
  return a
}

export async function runCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  if (!args.input) {
    process.stderr.write(
      'usage: ppdm-report-pptx <source.xlsx> [--out f] [--lang c] [--theme light|dark] [--flavor assessment|ops] [--quiet]\n',
    )
    return 2
  }
  try {
    const bytes = await readFile(args.input)
    const doc = ingestReport([{ name: basename(args.input), bytes }])
    const product: ProductId = doc.products[0]?.product ?? 'unknown'
    const estate = doc.products[0]?.estate
    if (!estate) {
      process.stderr.write('error: no product estate produced from the input\n')
      return 1
    }
    const t = createReportT(args.lang)
    const model = buildExportModel(
      estate.combined,
      args.flavor,
      args.theme,
      t,
      args.lang,
      estate.perServer,
      product,
    )
    const deck = await buildPptx(model, args.theme)
    const out =
      args.out ??
      join(
        dirname(args.input),
        `${basename(args.input).replace(/\.[^.]+$/, '')}_${SLUG[product]}-report.pptx`,
      )
    await writeFile(out, Buffer.from(deck))
    if (!args.quiet) process.stdout.write(`${out}\n`)
    return 0
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }
}

if (process.argv[1]?.endsWith('pptx.ts')) {
  runCli(process.argv.slice(2)).then((c) => process.exit(c))
}
