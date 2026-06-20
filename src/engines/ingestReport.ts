import type { ServerWorkbook } from '../types/ppdm'
import type { EstateDocument } from '../types/reportView'
import { deriveLabel } from './parser/deriveLabel'
import { detectProduct } from './parser/detectProduct'
import { normalizeWorkbook } from './parser/normalizeWorkbook'
import { buildEstateDocument } from './products/estateDocument'

export interface ReportFile {
  name: string
  bytes: ArrayBuffer | Uint8Array
}

/** Parse a single workbook file into a tagged ServerWorkbook (synchronous, main-thread safe). */
export function parseServerWorkbook(name: string, bytes: ArrayBuffer | Uint8Array): ServerWorkbook {
  const buf =
    bytes instanceof Uint8Array
      ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      : bytes
  const workbook = normalizeWorkbook(buf)
  const product = detectProduct(workbook)
  const label = deriveLabel(workbook, name)
  return { label, product, workbook }
}

/** Parse all report files and derive the full EstateDocument in one call. */
export function ingestReport(files: ReportFile[]): EstateDocument {
  return buildEstateDocument(files.map((f) => parseServerWorkbook(f.name, f.bytes)))
}
