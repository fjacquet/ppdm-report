import type { ParsedWorkbook } from '../../types/ppdm'
import type { ParseRequest, ParseResponse } from './parser.worker'

let worker: Worker | null = null
let nextId = 1

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

/** Parse a dropped File in the worker; resolves with the normalized workbook. */
export async function parseInWorker(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer()
  const w = getWorker()
  const id = nextId++
  return new Promise<ParsedWorkbook>((resolve, reject) => {
    const onMessage = (e: MessageEvent<ParseResponse>) => {
      if (e.data.id !== id) return
      w.removeEventListener('message', onMessage)
      if (e.data.ok) resolve(e.data.result)
      else reject(new Error(e.data.error))
    }
    w.addEventListener('message', onMessage)
    const req: ParseRequest = { id, buffer }
    w.postMessage(req, [buffer])
  })
}
