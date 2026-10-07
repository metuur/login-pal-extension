import type { CatalogRule, Envelope, VaultPayload } from '../shared/types';
import { parseRule, formatRule } from './rules';
const ITERATIONS = 600000,
  MAX_BYTES = 5 * 1024 * 1024;
const encoder = new TextEncoder();
const fail = () => new Error('Unable to unlock vault.');
function base64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
function decode(value: string, size?: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_BYTES * 2 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  )
    throw fail();
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (size !== undefined && bytes.length !== size) throw fail();
  return bytes;
}
export function randomSalt(): string {
  return base64(crypto.getRandomValues(new Uint8Array(16)));
}
export async function deriveVaultKey(password: string, salt: string): Promise<string> {
  try {
    if (typeof password !== 'string') throw fail();
    const material = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: decode(salt, 16) },
      material,
      256,
    );
    return base64(new Uint8Array(bits));
  } catch {
    throw fail();
  }
}
async function key(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', decode(raw, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function integer(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}
/** Catalogs written before multi-origin support carry a single catalogRule. */
export function migrateVaultPayload(v: unknown) {
  if (!record(v) || Array.isArray(v.catalogRules)) return;
  v.catalogRules = v.catalogRule ? [v.catalogRule] : [];
  delete v.catalogRule;
}
function validRule(r: unknown): boolean {
  if (
    !record(r) ||
    typeof r.origin !== 'string' ||
    typeof r.pathname !== 'string' ||
    typeof r.hash !== 'string' ||
    !['exact', 'prefix'].includes(String(r.pathMatch))
  )
    return false;
  try {
    const rule = r as unknown as CatalogRule;
    return (
      JSON.stringify(parseRule(formatRule(rule))) ===
      JSON.stringify({
        origin: rule.origin,
        pathname: rule.pathname,
        hash: rule.hash,
        pathMatch: rule.pathMatch,
      })
    );
  } catch {
    return false;
  }
}
function validPayload(v: unknown): v is VaultPayload {
  if (
    !record(v) ||
    v.schemaVersion !== 1 ||
    !integer(v.revision) ||
    !integer(v.snapshotRevision) ||
    !integer(v.catalogRuleRevision) ||
    !Array.isArray(v.accounts) ||
    v.accounts.length > 10000 ||
    !record(v.history)
  )
    return false;
  if (!Array.isArray(v.catalogRules) || v.catalogRules.length > 20) return false;
  if (!v.catalogRules.every(validRule)) return false;
  if (!v.catalogRules.length && v.accounts.length) return false;
  const ids = new Set<string>();
  for (const a of v.accounts) {
    if (
      !record(a) ||
      typeof a.accountId !== 'string' ||
      !a.accountId ||
      a.accountId.trim() !== a.accountId ||
      ids.has(a.accountId) ||
      typeof a.username !== 'string' ||
      !a.username ||
      a.username.trim() !== a.username ||
      typeof a.password !== 'string' ||
      !a.password ||
      !record(a.metadata) ||
      !Object.values(a.metadata).every((s) => typeof s === 'string')
    )
      return false;
    ids.add(a.accountId);
  }
  for (const h of Object.values(v.history)) {
    if (
      !record(h) ||
      !Array.isArray(h.recentAccountIds) ||
      h.recentAccountIds.length > 10 ||
      new Set(h.recentAccountIds).size !== h.recentAccountIds.length ||
      !h.recentAccountIds.every((id) => typeof id === 'string' && ids.has(id))
    )
      return false;
    if (h.lastSuccessfulAccountId === null) {
      if (h.lastSuccessfulAt !== null) return false;
    } else if (
      typeof h.lastSuccessfulAccountId !== 'string' ||
      !ids.has(h.lastSuccessfulAccountId) ||
      typeof h.lastSuccessfulAt !== 'number' ||
      !Number.isFinite(h.lastSuccessfulAt) ||
      h.lastSuccessfulAt < 0
    )
      return false;
  }
  return true;
}
function aad(salt: string): string {
  return JSON.stringify({ version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt });
}
async function seal(
  value: unknown,
  raw: string,
  purpose: string,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(purpose), tagLength: 128 },
    await key(raw),
    encoder.encode(JSON.stringify(value)),
  );
  return { iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
}
async function unseal<T>(
  sealed: { iv: string; ciphertext: string },
  raw: string,
  purpose: string,
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decode(sealed.iv, 12),
      additionalData: encoder.encode(purpose),
      tagLength: 128,
    },
    await key(raw),
    decode(sealed.ciphertext),
  );
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) as T;
}
// @spec R-1.3, R-1.9: authenticate all KDF metadata and validate decrypted structure.
export async function encryptVault(
  payload: VaultPayload,
  raw: string,
  salt: string,
): Promise<Envelope> {
  try {
    decode(salt, 16);
    if (!validPayload(payload)) throw fail();
    const sealed = await seal(payload, raw, aad(salt));
    const envelope: Envelope = {
      version: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: ITERATIONS,
      salt,
      ...sealed,
    };
    if (encoder.encode(JSON.stringify(envelope)).length > MAX_BYTES)
      throw new Error('Vault exceeds the 5 MiB encrypted storage limit.');
    return envelope;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Vault exceeds the 5 MiB encrypted storage limit.'
    )
      throw error;
    throw new Error('Unable to encrypt vault.');
  }
}
export async function decryptVault(envelope: Envelope, raw: string): Promise<VaultPayload> {
  try {
    if (
      !record(envelope) ||
      envelope.version !== 1 ||
      envelope.kdf !== 'PBKDF2-SHA256' ||
      envelope.iterations !== ITERATIONS ||
      encoder.encode(JSON.stringify(envelope)).length > MAX_BYTES
    )
      throw fail();
    decode(envelope.salt, 16);
    const payload = await unseal<unknown>(envelope, raw, aad(envelope.salt));
    migrateVaultPayload(payload);
    if (!validPayload(payload)) throw fail();
    return payload;
  } catch {
    throw fail();
  }
}
export async function sealValue(
  value: unknown,
  raw: string,
  purpose: string,
): Promise<{ iv: string; ciphertext: string }> {
  try {
    return await seal(value, raw, 'account-assistant:value:' + purpose);
  } catch {
    throw new Error('Unable to secure temporary data.');
  }
}
export async function unsealValue<T>(
  sealed: { iv: string; ciphertext: string },
  raw: string,
  purpose: string,
): Promise<T> {
  try {
    return await unseal<T>(sealed, raw, 'account-assistant:value:' + purpose);
  } catch {
    throw new Error('Unable to restore temporary data.');
  }
}
