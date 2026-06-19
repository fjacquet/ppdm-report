import '../../privacy/fetchGuard'
import type { RawWorkbook } from '../../types/ppdm'
import { normalizeWorkbook } from './normalizeWorkbook'

export type ParseRequest = { id: number; buffer: ArrayBuffer }
export type ParseResponse =
  | { id: number; ok: true; result: RawWorkbook }
  | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  const { id, buffer } = e.data
  try {
    const result = normalizeWorkbook(buffer)
    const res: ParseResponse = { id, ok: true, result }
    ;(self as unknown as Worker).postMessage(res)
  } catch (err) {
    const res: ParseResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(res)
  }
}
