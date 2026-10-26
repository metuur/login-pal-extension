import type { Account, ImportDiagnostic, ImportResult } from '../shared/types';
// @spec R-JS-1.1..R-JS-1.5, R-JS-2.1..R-JS-2.5: decode, strip BOM, parse, require
// a top-level array, enforce document ceilings, then validate records in CSV's order.
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
  if (doc.length > 10000) throw new Error('JSON exceeds 10,000 records.');
  if (
    doc.some(
      (record) =>
        typeof record === 'object' &&
        record !== null &&
        !Array.isArray(record) &&
        Object.keys(record).length > 100,
    )
  )
    throw new Error('JSON records are limited to 100 fields.');
  const frequencies = new Map<string, number>();
  for (const record of doc) {
    if (typeof record !== 'object' || record === null) continue;
    const id = (record as Record<string, unknown>).account_id;
    if (typeof id === 'string' && id.trim()) {
      const trimmed = id.trim();
      frequencies.set(trimmed, (frequencies.get(trimmed) ?? 0) + 1);
    }
  }
  const accounts: Account[] = [],
    diagnostics: ImportDiagnostic[] = [];
  doc.forEach((record, index) => {
    const at = index + 1;
    const isObject = typeof record === 'object' && record !== null && !Array.isArray(record);
    const fields = isObject ? (record as Record<string, unknown>) : {};
    const rawId = fields.account_id;
    const requiredPresent =
      typeof fields.account_id === 'string' &&
      typeof fields.username === 'string' &&
      typeof fields.password === 'string';
    const accountId = typeof rawId === 'string' ? rawId.trim() : '';
    const username = typeof fields.username === 'string' ? fields.username.trim() : '';
    const password = typeof fields.password === 'string' ? fields.password : '';
    const code =
      typeof rawId === 'string' && rawId.trim() && (frequencies.get(rawId.trim()) ?? 0) > 1
        ? 'DUPLICATE_ACCOUNT_ID'
        : !isObject
          ? 'RECORD_NOT_OBJECT'
          : !requiredPresent
            ? 'REQUIRED_FIELD_NOT_STRING'
            : !accountId
              ? 'EMPTY_ACCOUNT_ID'
              : !username
                ? 'EMPTY_USERNAME'
                : password === ''
                  ? 'EMPTY_PASSWORD'
                  : null;
    if (code) {
      diagnostics.push({ at, unit: 'record', code });
      return;
    }
    // Non-reserved keys become metadata. Story 5.1 fills in scalar coercion;
    // this placeholder keeps the shape stable until then.
    const metadata: Record<string, string> = {};
    accounts.push({ accountId, username, password, metadata });
  });
  return {
    accounts,
    found: doc.length,
    valid: accounts.length,
    invalid: diagnostics.length,
    diagnostics,
  };
}
