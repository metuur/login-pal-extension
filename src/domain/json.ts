import type { Account, ImportDiagnostic, ImportResult } from '../shared/types';
// A non-reserved key whose value is an array or a non-null object makes the
// record invalid (R-JS-3.6) rather than being flattened or stringified.
function hasNonScalarMetadata(fields: Record<string, unknown>): boolean {
  return Object.entries(fields).some(
    ([key, value]) =>
      !['account_id', 'username', 'password'].includes(key) &&
      typeof value === 'object' &&
      value !== null,
  );
}
// @spec R-JS-1.1..R-JS-1.5, R-JS-2.1..R-JS-2.5, R-JS-3.1..R-JS-3.8: decode, strip BOM,
// parse, require a top-level array, enforce document ceilings, then validate
// records in CSV's order, coercing scalar metadata to text.
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
                  : hasNonScalarMetadata(fields)
                    ? 'METADATA_VALUE_NOT_SCALAR'
                    : null;
    if (code) {
      diagnostics.push({ at, unit: 'record', code });
      return;
    }
    // Non-reserved keys become metadata. Strings are stored unchanged; numbers
    // and booleans as String(value); null as ''. Object.fromEntries builds the
    // object by own-property assignment, so a `__proto__` key cannot invoke the
    // prototype setter the way `metadata['__proto__'] = v` on a `{}` literal would.
    //
    // Numeric spelling is not preserved: JSON.parse already loses precision
    // beyond 2^53 (12345678901234567890 becomes 12345678901234567000),
    // String() renders large/small magnitudes in exponent form (1e21 becomes
    // '1e+21'), and String(-0) is '0'. This is a documented limitation
    // (R-JS-3.4), not a bug — CSV preserves exact spelling because it never
    // parses the value as a number in the first place.
    const metadata: Record<string, string> = Object.fromEntries(
      Object.entries(fields)
        .filter(([key]) => !['account_id', 'username', 'password'].includes(key))
        .map(([key, value]) => [
          key,
          typeof value === 'string' ? value : value === null ? '' : String(value),
        ]),
    );
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
