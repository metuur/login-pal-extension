import type { ImportResult } from '../shared/types';
// @spec R-JS-1.1..R-JS-1.3: decode, strip BOM, parse, require a top-level array.
export function parseJson(bytes: Uint8Array): ImportResult {
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('JSON exceeds the 2 MiB file limit.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('JSON must use valid UTF-8.');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!Array.isArray(doc)) throw new Error('JSON must be an array of account records.');
  // Record iteration, ceilings and per-record validation land in stories 3.2+.
  return { accounts: [], found: doc.length, valid: 0, invalid: 0, diagnostics: [] };
}
