import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { encryptVault, randomSalt } from './crypto';
import { emptyVault, planImport } from './import';
import { parseRule } from './rules';

const encode = (value: string) => new TextEncoder().encode(value);
const header = 'account_id,username,password';

describe('accepted limits and first rejected sizes', () => {
  it('accepts exactly 10,000 rows and rejects the next row', () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => `${index},test@example.test,fixture`);
    const parsed = parseCsv(encode([header, ...rows].join('\n')));
    expect(parsed.valid).toBe(10_000);
    const planned = planImport(
      emptyVault(),
      parsed,
      parseRule('https://qa.example.test/*'),
      'merge',
    );
    expect(planned.payload.accounts.length).toBe(10_000);
    expect(() =>
      parseCsv(encode([header, ...rows, 'extra,test@example.test,fixture'].join('\n'))),
    ).toThrow('10,000');
  });

  it('accepts exactly 100 columns and rejects the next column', () => {
    const columns = [
      'account_id',
      'username',
      'password',
      ...Array.from({ length: 97 }, (_, index) => `metadata_${index}`),
    ];
    const values = [
      'A',
      'test@example.test',
      'fixture',
      ...Array.from({ length: 97 }, () => 'text'),
    ];
    const parsed = parseCsv(encode(`${columns.join(',')}\n${values.join(',')}`));
    expect(parsed.valid).toBe(1);
    expect(Object.keys(parsed.accounts[0]!.metadata).length).toBe(97);
    expect(() => parseCsv(encode(`${columns.join(',')},extra\n${values.join(',')},text`))).toThrow(
      '100 columns',
    );
  });

  it('accepts exactly 2 MiB of UTF-8 CSV bytes and rejects one extra byte', () => {
    const prefix = `${header},notes\nA,test@example.test,fixture,`;
    const bytes = encode(prefix + 'x'.repeat(2 * 1024 * 1024 - encode(prefix).length));
    expect(bytes.length).toBe(2 * 1024 * 1024);
    expect(parseCsv(bytes).valid).toBe(1);
    const oversized = new Uint8Array(bytes.length + 1);
    oversized.set(bytes);
    expect(() => parseCsv(oversized)).toThrow('2 MiB');
  });

  it('accepts the largest representable envelope below 5 MiB and rejects the next plaintext byte', async () => {
    const rule = parseRule('https://qa.example.test/*');
    const payload = planImport(
      emptyVault(),
      parseCsv(encode(`${header},notes\nA,test@example.test,fixture,x`)),
      rule,
      'replace',
    ).payload;
    const salt = randomSalt();
    const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const initial = await encryptVault(payload, key, salt);
    const limit = 5 * 1024 * 1024;
    const envelopeOverhead = encode(JSON.stringify(initial)).length - initial.ciphertext.length;
    // Base64 represents groups of three cipher bytes with four ASCII characters.
    // GCM appends a 16-byte authentication tag to the serialized payload.
    const maxPlaintextBytes = Math.floor((limit - envelopeOverhead) / 4) * 3 - 16;
    const initialPlaintextBytes = encode(JSON.stringify(payload)).length;
    payload.accounts[0]!.metadata.notes = 'x'.repeat(1 + maxPlaintextBytes - initialPlaintextBytes);
    const accepted = await encryptVault(payload, key, salt);
    const size = encode(JSON.stringify(accepted)).length;
    expect(size <= limit && limit - size < 4).toBe(true);
    payload.accounts[0]!.metadata.notes += 'x';
    await expect(encryptVault(payload, key, salt)).rejects.toThrow(
      'Vault exceeds the 5 MiB encrypted storage limit.',
    );
  });
});
