import '../../privacy/fetchGuard'
import type { RawWorkbook } from '../../types/ppdm'
import { normalizeWorkbook } from './normalizeWorkbook'

export type ParseRequest = { id: number; buffer: ArrayBuffer }
export type ParseResponse =
  | { id: number; ok: true; result: RawWorkbook }
  | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  // Defense-in-depth: a dedicated worker can only be reached by the same-origin
  // document that created it, so `origin` is '' here; reject anything else.
  if (e.origin !== '' && e.origin !== self.location.origin) return
  // Validate the message shape before touching it (the parse boundary).
  const { id, buffer } = e.data ?? {}
  if (typeof id !== 'number' || !(buffer instanceof ArrayBuffer)) return
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
