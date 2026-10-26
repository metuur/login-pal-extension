import type { CatalogRule } from '../shared/types';
import { exportCsv as serializeAccounts } from './csv';
import { describe, it, expect } from 'vitest';
import {
  deriveVaultKey,
  randomSalt,
  encryptVault,
  decryptVault,
  sealValue,
  unsealValue,
  migrateVaultPayload,
} from './crypto';
import { parseCsv } from './csv';
import { parseJson } from './json';
import {
  parseRule,
  parseDomainRule,
  parseRoute,
  matchesRule,
  matchesRoute,
  validateProfile,
  isAuthorizedPageUrl,
  suggestMatch,
  parseDomainRules,
  matchesAnyOrigin,
  matchesAnyRule,
  normalizeApplicationTitle,
  matchesTitleRule,
} from './rules';
import { emptyVault, planImport } from './import';
import { searchAccounts, searchAccountsAcrossGroups } from './search';
const csv = (s: string) => parseCsv(new TextEncoder().encode(s));
const json = (s: string) => parseJson(new TextEncoder().encode(s));
const header = 'account_id,username,password,company';
describe('CSV validation', () => {
  it('preserves quoted fields, whitespace and BOM', () => {
    const r = csv('\ufeff' + header + '\r\nx, user ,"  synthetic,pass  ","Acme\nCorp"');
    expect(r.accounts[0]?.username).toBe('user');
    expect(r.accounts[0]?.password.length).toBe(18);
    expect(r.accounts[0]?.metadata.company).toBe('Acme\nCorp');
  });
  it('rejects every duplicate even invalid rows', () => {
    const r = csv(header + '\nx,u,p,c\nx,,p,c\ny,u,p,c');
    expect(r.valid).toBe(1);
    expect(r.invalid).toBe(2);
  });
  it('rejects malformed headers and quoting safely', () => {
    for (const s of [
      'account_id,username,password, PASSWORD\nx,u,p,p',
      header + '\nx,u,"unterminated,c',
    ])
      expect(() => csv(s)).toThrow();
  });
  it('rejects invalid UTF8 and file limits', () => {
    expect(() => parseCsv(new Uint8Array([255]))).toThrow();
    expect(() => parseCsv(new Uint8Array(2097153))).toThrow();
  });
  it('preserves metadata keys without prototype mutation', () => {
    const r = csv('account_id,username,password,__proto__\nx,u,p,text');
    expect(Object.hasOwn(r.accounts[0]!.metadata, '__proto__')).toBe(true);
  });
});
describe('JSON validation', () => {
  it('parses a BOM-prefixed valid document', () => {
    const r = json('﻿[{"account_id":"a"}]');
    expect(r.found).toBe(1);
  });
  it('rejects malformed JSON as a single whole-document failure', () => {
    expect(() => json('{not json')).toThrow('File is not valid JSON.');
  });
  it('rejects a top-level object', () => {
    expect(() => json('{"accounts": []}')).toThrow('JSON must be an array of account records.');
  });
  it('rejects a top-level string', () => {
    expect(() => json('"a string"')).toThrow('JSON must be an array of account records.');
  });
  it('reports found: 0 for an empty array', () => {
    expect(json('[]').found).toBe(0);
  });
  it('reports found: 3 for a valid 3-element array', () => {
    expect(json('[{"a":1},{"b":2},{"c":3}]').found).toBe(3);
  });
  it('rejects a document over the 2 MiB file limit', () => {
    expect(() => parseJson(new Uint8Array(2097153))).toThrow('2 MiB');
  });
  it('rejects invalid UTF-8', () => {
    expect(() => parseJson(new Uint8Array([255]))).toThrow();
  });
  it('rejects a document with a record over 100 own keys as a whole-document failure', () => {
    const wide: Record<string, string> = {};
    for (let index = 0; index < 101; index++) wide[`k${index}`] = 'v';
    expect(() => json(JSON.stringify([wide]))).toThrow('JSON records are limited to 100 fields.');
  });
  it('treats a long array element as a bad record, not a wide one', () => {
    // Arrays are typeof 'object', so the width check must exclude them or a
    // long array would reject the whole document instead of reporting itself.
    const r = json(JSON.stringify([Array.from({ length: 101 }, (_, i) => i)]));
    expect(r.diagnostics).toEqual([{ at: 1, unit: 'record', code: 'RECORD_NOT_OBJECT' }]);
  });
  it('reports RECORD_NOT_OBJECT for non-object elements', () => {
    const r = json('[1, "two", true, null, ["array"]]');
    expect(r.found).toBe(5);
    expect(r.invalid).toBe(5);
    expect(r.valid).toBe(0);
    expect(r.diagnostics).toEqual(
      [1, 2, 3, 4, 5].map((at) => ({ at, unit: 'record', code: 'RECORD_NOT_OBJECT' })),
    );
  });
  it('reports REQUIRED_FIELD_NOT_STRING when a reserved field is absent or not a string', () => {
    const r = json(
      JSON.stringify([
        { username: 'u', password: 'p' },
        { account_id: 1, username: 'u', password: 'p' },
      ]),
    );
    expect(r.diagnostics).toEqual([
      { at: 1, unit: 'record', code: 'REQUIRED_FIELD_NOT_STRING' },
      { at: 2, unit: 'record', code: 'REQUIRED_FIELD_NOT_STRING' },
    ]);
  });
  it('reports EMPTY_ACCOUNT_ID for a blank trimmed account_id', () => {
    const r = json(JSON.stringify([{ account_id: '  ', username: 'u', password: 'p' }]));
    expect(r.diagnostics).toEqual([{ at: 1, unit: 'record', code: 'EMPTY_ACCOUNT_ID' }]);
  });
  it('reports EMPTY_USERNAME for a blank trimmed username', () => {
    const r = json(JSON.stringify([{ account_id: 'a', username: ' ', password: 'p' }]));
    expect(r.diagnostics).toEqual([{ at: 1, unit: 'record', code: 'EMPTY_USERNAME' }]);
  });
  it('reports EMPTY_PASSWORD only for the exact empty string, preserving other whitespace', () => {
    const r = json(JSON.stringify([{ account_id: 'a', username: 'u', password: '' }]));
    expect(r.diagnostics).toEqual([{ at: 1, unit: 'record', code: 'EMPTY_PASSWORD' }]);
    const preserved = json(JSON.stringify([{ account_id: 'a', username: 'u', password: ' p ' }]));
    expect(preserved.accounts[0]?.password).toBe(' p ');
  });
  it('reports DUPLICATE_ACCOUNT_ID for repeated trimmed account_id values', () => {
    const r = json(
      JSON.stringify([
        { account_id: ' a ', username: 'u', password: 'p' },
        { account_id: 'a', username: 'u2', password: 'p2' },
      ]),
    );
    expect(r.diagnostics).toEqual([
      { at: 1, unit: 'record', code: 'DUPLICATE_ACCOUNT_ID' },
      { at: 2, unit: 'record', code: 'DUPLICATE_ACCOUNT_ID' },
    ]);
  });
  it('reports the duplicate ahead of a later ladder code, and resolves non-object records independently', () => {
    // A single record cannot be both duplicate (requires a readable string
    // account_id, hence an object) and RECORD_NOT_OBJECT. This instead proves
    // ladder order against the next achievable code (REQUIRED_FIELD_NOT_STRING)
    // while a sibling non-object element reports its own cause untouched.
    const r = json(
      JSON.stringify([
        { account_id: 'dup', username: 'u', password: 'p' },
        { account_id: 'dup', username: 123, password: 'p' },
        'not-an-object',
      ]),
    );
    expect(r.diagnostics).toEqual([
      { at: 1, unit: 'record', code: 'DUPLICATE_ACCOUNT_ID' },
      { at: 2, unit: 'record', code: 'DUPLICATE_ACCOUNT_ID' },
      { at: 3, unit: 'record', code: 'RECORD_NOT_OBJECT' },
    ]);
  });
  it('counts only non-empty trimmed identifiers as duplicates (story 4.2)', () => {
    const blankIds = json(
      JSON.stringify(
        Array.from({ length: 3 }, () => ({ account_id: '', username: 'u', password: 'p' })),
      ),
    );
    expect(blankIds.diagnostics.every((d) => d.code === 'EMPTY_ACCOUNT_ID')).toBe(true);
    const absentIds = json(
      JSON.stringify(Array.from({ length: 3 }, () => ({ username: 'u', password: 'p' }))),
    );
    expect(absentIds.diagnostics.every((d) => d.code === 'REQUIRED_FIELD_NOT_STRING')).toBe(true);
    const numericIds = json(
      JSON.stringify(
        Array.from({ length: 3 }, () => ({ account_id: 1, username: 'u', password: 'p' })),
      ),
    );
    expect(numericIds.diagnostics.every((d) => d.code === 'REQUIRED_FIELD_NOT_STRING')).toBe(true);
  });
  it('coerces each scalar metadata value kind to its expected string (story 5.1)', () => {
    const r = json(
      JSON.stringify([
        {
          account_id: 'a',
          username: 'u',
          password: 'p',
          str: 'hello',
          int: 42,
          float: 3.14,
          yes: true,
          no: false,
          nothing: null,
        },
      ]),
    );
    expect(r.accounts[0]?.metadata).toEqual({
      str: 'hello',
      int: '42',
      float: '3.14',
      yes: 'true',
      no: 'false',
      nothing: '',
    });
  });
  it('documents the numeric-spelling limitation rather than preserving source spelling (R-JS-3.4)', () => {
    // Known, accepted limitation: JSON.parse loses integer precision beyond
    // 2^53, String() renders extreme magnitudes in exponent form, and
    // String(-0) collapses to '0'. CSV preserves exact spelling because it
    // never parses the value as a number; JSON does, and this is the cost.
    // Written as literal JSON text (not JSON.stringify of a JS number
    // literal), so the source spelling under test is the one a user's file
    // would actually contain, not one already rounded by the JS parser.
    const r = json(
      '[' +
        '{"account_id":"a","username":"u","password":"p","big":12345678901234567890},' +
        '{"account_id":"b","username":"u","password":"p","exp":1e21},' +
        '{"account_id":"c","username":"u","password":"p","negZero":-0}' +
        ']',
    );
    expect(r.accounts[0]?.metadata.big).toBe('12345678901234567000');
    expect(r.accounts[1]?.metadata.exp).toBe('1e+21');
    expect(r.accounts[2]?.metadata.negZero).toBe('0');
  });
  it('rejects a record whose metadata value is an array or a nested object (story 5.2)', () => {
    const r = json(
      JSON.stringify([
        { account_id: 'a', username: 'u', password: 'p', tags: ['x', 'y'] },
        { account_id: 'b', username: 'u', password: 'p', nested: { x: 1 } },
        { account_id: 'c', username: 'u', password: 'p', fine: 'ok' },
      ]),
    );
    expect(r.diagnostics).toEqual([
      { at: 1, unit: 'record', code: 'METADATA_VALUE_NOT_SCALAR' },
      { at: 2, unit: 'record', code: 'METADATA_VALUE_NOT_SCALAR' },
    ]);
    expect(r.valid).toBe(1);
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0]?.accountId).toBe('c');
  });
  it('preserves a __proto__ metadata key as an own property without mutating the prototype (story 5.3)', () => {
    // Written as literal JSON text, not an object-literal key: `{ __proto__: v }`
    // in JS source sets the prototype instead of creating an own property, so
    // JSON.stringify would never emit it. JSON.parse, unlike object-literal
    // syntax, builds `__proto__` as an ordinary own property.
    const r = json('[{"account_id":"a","username":"u","password":"p","__proto__":"text"}]');
    expect(Object.hasOwn(r.accounts[0]!.metadata, '__proto__')).toBe(true);
    expect(r.accounts[0]!.metadata.__proto__).toBe('text');
    expect(({} as Record<string, unknown>).evil).toBeUndefined();
  });
  it('does not leak reserved keys into metadata', () => {
    const r = json(JSON.stringify([{ account_id: 'a', username: 'u', password: 'p', note: 'x' }]));
    expect(r.accounts[0]?.metadata).toEqual({ note: 'x' });
    expect(r.accounts[0]?.metadata.account_id).toBeUndefined();
    expect(r.accounts[0]?.metadata.username).toBeUndefined();
    expect(r.accounts[0]?.metadata.password).toBeUndefined();
  });
});
describe('authorization rules', () => {
  it('matches domains regardless of path and hash, keeping success routes exact', () => {
    const r = parseRule('https://QA.example.com:443/login*?x=1#ok');
    expect(matchesRule(r, 'https://qa.example.com/login/next#ok')).toBe(true);
    expect(matchesRule(r, 'https://qa.example.com.evil/login#ok')).toBe(false);
    expect(matchesRule(r, 'https://qa.example.com/login')).toBe(true);
    expect(
      matchesRoute(parseRoute('https://qa.example.com/login'), 'https://qa.example.com/login/'),
    ).toBe(false);
  });
  it('rejects broad or ambiguous policy', () => {
    for (const u of [
      'ftp://qa.example.com/*',
      'file:///tmp/*',
      'https://*.example.com/*',
      'https://u:p@qa.example.com/*',
      'https://qa.example.com/a*b',
      'https://qa.example.com/*?q=*',
      'https://qa.example.com/*#*',
    ])
      expect(() => parseRule(u)).toThrow();
    expect(parseRule('https://qa.example.com/%2A').pathMatch).toBe('exact');
  });
  it('allows plain http on any host while keeping the scheme part of the origin', () => {
    expect(parseRule('http://localhost:3000/*').origin).toBe('http://localhost:3000');
    expect(parseRule('http://app.localhost/login*').origin).toBe('http://app.localhost');
    expect(parseRule('http://127.0.0.1:8080/*').origin).toBe('http://127.0.0.1:8080');
    expect(parseRule('http://qa.example.com/*').origin).toBe('http://qa.example.com');
    expect(parseRule('http://10.0.0.1/*').origin).toBe('http://10.0.0.1');
    for (const u of ['ftp://qa.example.com/*', 'file:///tmp/*', 'chrome://settings/*'])
      expect(() => parseRule(u)).toThrow();
    const r = parseRule('http://localhost:3000/*');
    expect(matchesRule(r, 'http://localhost:3000/login')).toBe(true);
    expect(matchesRule(r, 'https://localhost:3000/login')).toBe(false);
    expect(matchesRule(r, 'http://localhost:3001/login')).toBe(false);
    expect(
      validateProfile(
        {
          name: 'Local',
          loginUrl: 'http://localhost:3000/login',
          usernameSelector: '#u',
          passwordSelector: '#p',
          successKind: 'url',
          successUrl: 'http://localhost:3000/home',
        },
        [r],
        1,
      ).logins[0].origin,
    ).toBe('http://localhost:3000');
  });
  it('trusts content senders on http and https only', () => {
    expect(isAuthorizedPageUrl('https://qa.example.com/login')).toBe(true);
    expect(isAuthorizedPageUrl('http://localhost:3000/login')).toBe(true);
    expect(isAuthorizedPageUrl('http://127.0.0.1/login')).toBe(true);
    expect(isAuthorizedPageUrl('http://qa.example.com/login')).toBe(true);
    expect(isAuthorizedPageUrl('file:///tmp/login.html')).toBe(false);
    expect(isAuthorizedPageUrl('ftp://qa.example.com/login')).toBe(false);
    expect(isAuthorizedPageUrl(undefined)).toBe(false);
  });
  it('profile requires matching login and distinct URL success', () => {
    const p = {
      name: 'QA',
      loginUrl: 'https://qa.example.com/login',
      usernameSelector: '#u',
      passwordSelector: '#p',
      successKind: 'url' as const,
      successUrl: 'https://qa.example.com/home',
    };
    expect(
      validateProfile(p, [parseRule('https://qa.example.com/login*')], 2)
        .approvedCatalogRuleRevision,
    ).toBe(2);
    expect(() =>
      validateProfile({ ...p, successUrl: p.loginUrl }, [parseRule('https://qa.example.com/*')], 2),
    ).toThrow();
  });
});
describe('application title rules', () => {
  it('normalizes titles and configured values with trim, NFKC, and case folding', () => {
    expect(normalizeApplicationTitle('  ＡＣＭＥ　Console  ')).toBe('acme console');
    expect(
      matchesTitleRule({ mode: 'equals', value: 'ACME Console' }, '  ＡＣＭＥ　Console  '),
    ).toBe(true);
  });
  it('uses literal contains matching by default-compatible mode and supports exact mode', () => {
    expect(matchesTitleRule({ mode: 'contains', value: 'dashboard' }, 'QA Dashboard - Local')).toBe(
      true,
    );
    expect(matchesTitleRule({ mode: 'equals', value: 'dashboard' }, 'QA Dashboard - Local')).toBe(
      false,
    );
    expect(matchesTitleRule({ mode: 'contains', value: 'a+b' }, 'QA a+b Local')).toBe(true);
    expect(matchesTitleRule({ mode: 'contains', value: 'a+b' }, 'QA aaab Local')).toBe(false);
  });
  it('does not match empty or malformed rule values', () => {
    expect(matchesTitleRule({ mode: 'contains', value: '  ' }, 'Any Application')).toBe(false);
    expect(matchesTitleRule({ mode: 'equals', value: '  ' }, '  ')).toBe(false);
    expect(matchesTitleRule({ mode: 'regex' as never, value: '.*' }, 'Any Application')).toBe(
      false,
    );
  });
});
describe('transaction planning', () => {
  it('merges complete records and invalidates credential history', () => {
    const rule = parseRule('https://qa.example.com/*');
    const a = planImport(emptyVault(), csv(header + '\na,u,p,c\nb,v,p,c'), [rule], 'merge').payload;
    a.history.p = {
      lastSuccessfulAccountId: 'a',
      lastSuccessfulAt: 10,
      recentAccountIds: ['a', 'b'],
    };
    const r = planImport(a, csv(header + '\na,u,new,d'), [rule], 'merge');
    expect(r.counts).toEqual({ added: 0, updated: 1, removed: 0, unchanged: 0 });
    expect(r.payload.accounts).toHaveLength(2);
    expect(r.payload.history.p?.lastSuccessfulAt).toBeNull();
    expect(a.history.p.lastSuccessfulAt).toBe(10);
    expect(() =>
      planImport(a, csv(header + '\nx,u,p,c'), [parseRule('https://other.example/*')], 'merge'),
    ).toThrow();
  });
  it('replace clears rule history and counts removed IDs', () => {
    const a = planImport(
      emptyVault(),
      csv(header + '\na,u,p,c'),
      [parseRule('https://qa.example.com/*')],
      'replace',
    ).payload;
    const r = planImport(
      a,
      csv(header + '\nb,u,p,c'),
      [parseRule('https://other.example/*')],
      'replace',
    );
    expect(r.counts.removed).toBe(1);
    expect(r.payload.catalogRuleRevision).toBe(2);
  });
});
describe('search', () => {
  it('matches across normalized metadata fields but never password', () => {
    const a = csv(header + '\nb,User,secretneedle,ＡＣＭＥ\na,Other,p,Premium').accounts;
    expect(searchAccounts(a, 'acme user', 0).matches).toBe(1);
    expect(searchAccounts(a, 'secretneedle', 0).matches).toBe(0);
    expect(searchAccounts(a, '', 0).accounts.map((a) => a.accountId)).toEqual(['a', 'b']);
    expect(searchAccounts(a, '', 0).accounts[0]).not.toHaveProperty('password');
  });
  it('searches group context and title rules across groups without exposing passwords', () => {
    const accounts = csv(header + '\nA,user,secretneedle,Premium').accounts;
    const records = [
      {
        account: accounts[0]!,
        groupId: 'z-group',
        groupName: 'Platform Z',
        profileName: 'Z staging',
        authorizedOrigins: ['http://localhost:5173'],
        titleRules: [{ origin: 'http://localhost:5173', mode: 'contains' as const, value: 'Vite' }],
      },
      {
        account: { ...accounts[0]!, username: 'other-user' },
        groupId: 'a-group',
        groupName: 'Platform A',
        profileName: 'A local',
        authorizedOrigins: ['http://localhost:5173'],
        titleRules: [{ origin: 'http://localhost:5173', mode: 'equals' as const, value: 'React' }],
      },
    ];
    const result = searchAccountsAcrossGroups(records, 'platform vite', 0);
    expect(result.accounts.map((item) => [item.groupId, item.accountId])).toEqual([
      ['z-group', 'A'],
    ]);
    expect(searchAccountsAcrossGroups(records, 'secretneedle', 0).matches).toBe(0);
    expect(result.accounts[0]).not.toHaveProperty('password');
    expect(searchAccountsAcrossGroups(records, '5173 React', 0).accounts[0]?.groupId).toBe(
      'a-group',
    );
  });
});
describe('vault cryptography', () => {
  it('round trips with fresh IV and rejects tamper or purpose changes', async () => {
    const salt = randomSalt(),
      key = await deriveVaultKey('synthetic test master', salt);
    const a = await encryptVault(emptyVault(), key, salt),
      b = await encryptVault(emptyVault(), key, salt);
    expect(a.iv).not.toBe(b.iv);
    expect(await decryptVault(a, key)).toEqual(emptyVault());
    await expect(decryptVault({ ...a, iterations: 1 }, key)).rejects.toThrow(
      'Unable to unlock vault.',
    );
    await expect(decryptVault({ ...a, ciphertext: a.ciphertext.slice(4) }, key)).rejects.toThrow(
      'Unable to unlock vault.',
    );
    const sealed = await sealValue({ id: 'a' }, key, 'undo');
    await expect(unsealValue(sealed, key, 'other')).rejects.toThrow();
  });
});

describe('limits and non-secret search performance', () => {
  it('paginates a 10,000-account catalog in stable ID order', () => {
    const accounts = Array.from({ length: 10000 }, (_, i) => ({
      accountId: String(i).padStart(5, '0'),
      username: 'synthetic@example.test',
      password: 'private-search-token',
      metadata: { company: 'Acme', role: 'QA' },
    }));
    const started = performance.now();
    const result = searchAccounts(accounts, 'acme qa', 199);
    expect(result.matches).toBe(10000);
    expect(result.accounts).toHaveLength(50);
    expect(result.accounts[0]?.accountId).toBe('09950');
    expect(performance.now() - started).toBeLessThan(200);
  });
  it('blocks final merged catalog limit without mutating input', () => {
    const initial = emptyVault();
    initial.catalogRules = [parseRule('https://qa.example.com/*')];
    initial.accounts = Array.from({ length: 10000 }, (_, i) => ({
      accountId: String(i),
      username: 'u',
      password: 'p',
      metadata: {},
    }));
    expect(() =>
      planImport(initial, csv(header + '\nnew,u,p,c'), initial.catalogRules, 'merge'),
    ).toThrow('10,000');
    expect(initial.accounts.length).toBe(10000);
  });
  it('supports a populated encrypted vault and rejects wrong keys', async () => {
    const salt = randomSalt(),
      key = await deriveVaultKey('synthetic test master', salt);
    const payload = planImport(
      emptyVault(),
      csv(header + '\na,u,p,c'),
      [parseRule('https://qa.example.com/*')],
      'merge',
    ).payload;
    const encrypted = await encryptVault(payload, key, salt);
    expect((await decryptVault(encrypted, key)).accounts).toHaveLength(1);
    const other = await deriveVaultKey('other synthetic master', salt);
    await expect(decryptVault(encrypted, other)).rejects.toThrow('Unable to unlock vault.');
  });
  it('rejects unexpected decrypted payload structure', async () => {
    const salt = randomSalt(),
      key = await deriveVaultKey('synthetic test master', salt);
    await expect(
      encryptVault(
        {
          ...emptyVault(),
          accounts: [{ accountId: 'x', username: 'u', password: 'p', metadata: {} }],
        },
        key,
        salt,
      ),
    ).rejects.toThrow('Unable to encrypt vault.');
  });
});

describe('strict import regressions', () => {
  it('rejects quotes embedded in unquoted fields and regex rules', () => {
    expect(() => csv(header + '\nx,u,ab"cd,c')).toThrow();
    for (const value of [
      'https://qa.example.com/(login|home)',
      'https://qa.example.com/login{1,2}',
      'https://qa.example.com/[a-z]*',
    ])
      expect(() => parseRule(value)).toThrow();
  });
  it('ignores blank logical records while preserving whitespace-only passwords', () => {
    const r = csv(header + '\n,,,\na, u ,   ,Acme\n');
    expect(r.found).toBe(1);
    expect(r.accounts[0]?.password.length).toBe(3);
  });
  it('counts logical rows with multiline metadata and all duplicate occurrences', () => {
    const r = csv(header + '\na,u,p,"line1\nline2"\na,u,p,c\nb,u,p,c');
    expect(r.diagnostics.map((d) => d.at)).toEqual([2, 3]);
    expect(r.diagnostics.map((d) => d.unit)).toEqual(['row', 'row']);
    expect(r.found).toBe(3);
  });
  it('rejects empty/missing headers and excess row/column limits', () => {
    for (const value of ['account_id,username,password,\nx,u,p,c', 'account_id,username\nx,u'])
      expect(() => csv(value)).toThrow();
    expect(() =>
      csv(header + '\n' + Array.from({ length: 10001 }, (_, i) => i + ',u,p,c').join('\n')),
    ).toThrow();
    expect(() =>
      csv(header + ',' + Array.from({ length: 97 }, (_, i) => 'm' + i).join(',')),
    ).toThrow();
  });
  it('prunes removed recent and success references but preserves metadata-only success', () => {
    const rule = parseRule('https://qa.example.com/*');
    const current = planImport(
      emptyVault(),
      csv(header + '\na,u,p,c\nb,u,p,c'),
      [rule],
      'merge',
    ).payload;
    current.history.profile = {
      lastSuccessfulAccountId: 'a',
      lastSuccessfulAt: 10,
      recentAccountIds: ['b', 'a'],
    };
    const changed = planImport(current, csv(header + '\na,u,p,changed'), [rule], 'replace');
    expect(changed.payload.history.profile).toEqual({
      lastSuccessfulAccountId: 'a',
      lastSuccessfulAt: 10,
      recentAccountIds: ['a'],
    });
    const removed = planImport(current, csv(header + '\nb,u,p,c'), [rule], 'replace');
    expect(removed.payload.history.profile?.lastSuccessfulAccountId).toBeNull();
    expect(removed.payload.history.profile?.lastSuccessfulAt).toBeNull();
  });
  it('ignores catalog paths, queries and fragments while retaining port boundaries', () => {
    const rule = parseRule('https://qa.example.com/%2A?ignored=yes');
    expect(matchesRule(rule, 'https://qa.example.com/%2A?other=1')).toBe(true);
    expect(matchesRule(rule, 'https://qa.example.com/anything')).toBe(true);
    expect(matchesRule(rule, 'https://qa.example.com:444/%2A')).toBe(false);
    expect(matchesRule(rule, 'https://qa.example.com/%2A#route')).toBe(true);
  });
  it('authenticates salt and version and handles large ciphertext', async () => {
    const salt = randomSalt(),
      key = await deriveVaultKey('synthetic test master', salt),
      value = emptyVault();
    const encrypted = await encryptVault(value, key, salt);
    await expect(decryptVault({ ...encrypted, salt: randomSalt() }, key)).rejects.toThrow();
    await expect(
      decryptVault({ ...encrypted, version: 2 } as unknown as typeof encrypted, key),
    ).rejects.toThrow();
    const sealed = await sealValue({ data: 'a'.repeat(100000) }, key, 'undo');
    expect((await unsealValue<{ data: string }>(sealed, key, 'undo')).data.length).toBe(100000);
  });
});

it('ignores arbitrary query data on observed URLs without accepting it in policy', () => {
  expect(
    matchesRoute(
      parseRoute('https://qa.example.com/login'),
      'https://qa.example.com/login?filter=*',
    ),
  ).toBe(true);
  expect(
    matchesRule(parseRule('https://qa.example.com/*'), 'https://qa.example.com/login?filter=*'),
  ).toBe(true);
});

describe('CSV group export', () => {
  it('round trips quotes, commas, Unicode, newlines and password whitespace', () => {
    const accounts: import('../shared/types').Account[] = [
      {
        accountId: 'QA-1',
        username: 'demo@example.test',
        password: '  synthetic,"value"\nnext  ',
        metadata: { company: 'Málaga, "QA"', notes: 'line 1\nline 2' },
      },
      {
        accountId: 'QA-2',
        username: 'other@example.test',
        password: '=synthetic-literal',
        metadata: { role: 'Tester' },
      },
    ];
    const csv = serializeAccounts(accounts);
    const parsed = parseCsv(new TextEncoder().encode(csv));
    expect(parsed.valid).toBe(2);
    expect(parsed.invalid).toBe(0);
    expect(
      parsed.accounts.every((account, index) => account.password === accounts[index].password),
    ).toBe(true);
    expect(parsed.accounts[0].metadata.company === accounts[0].metadata.company).toBe(true);
    expect(parsed.accounts[1].metadata.role).toBe('Tester');
    expect(parsed.accounts[0].metadata.role).toBe('');
  });
});

it('normalizes imported URLs to a domain and merges same-domain CSVs across paths', () => {
  const rule = parseDomainRule('https://QA.example.com:443/auth/login?tenant=1#form');
  expect(rule).toEqual({
    origin: 'https://qa.example.com',
    pathname: '/',
    hash: '',
    pathMatch: 'prefix',
  });
  const existing = planImport(
    emptyVault(),
    csv(header + '\na,u,p,c'),
    [parseRule('https://qa.example.com/old')],
    'merge',
  ).payload;
  const next = planImport(existing, csv(header + '\nb,u,p,c'), [rule], 'merge');
  expect(next.payload.accounts).toHaveLength(2);
  expect(next.payload.catalogRuleRevision).toBe(existing.catalogRuleRevision);
});

describe('detected field suggestions', () => {
  const input = (over: Partial<Parameters<typeof suggestMatch>[0]> = {}) => ({
    password: false,
    id: '',
    name: '',
    autocomplete: '',
    placeholder: '',
    ariaLabel: '',
    label: '',
    ...over,
  });
  it('prefers the most stable identifying attribute', () => {
    expect(suggestMatch(input({ id: 'user', name: 'email', placeholder: 'Email' }))).toEqual({
      match: 'id',
      value: 'user',
    });
    expect(suggestMatch(input({ name: 'email', placeholder: 'Email' }))).toEqual({
      match: 'name',
      value: 'email',
    });
    expect(suggestMatch(input({ ariaLabel: 'Account email', placeholder: 'Email' }))).toEqual({
      match: 'aria-label',
      value: 'Account email',
    });
    expect(suggestMatch(input({ placeholder: '  Email  ' }))).toEqual({
      match: 'placeholder',
      value: 'Email',
    });
  });
  it('ignores autocomplete values that identify nothing', () => {
    expect(suggestMatch(input({ autocomplete: 'off', placeholder: 'Email' }))).toEqual({
      match: 'placeholder',
      value: 'Email',
    });
    expect(suggestMatch(input({ autocomplete: 'username' }))).toEqual({
      match: 'autocomplete',
      value: 'username',
    });
  });
  it('reports nothing for an input with no identifying attribute', () => {
    expect(suggestMatch(input())).toBeNull();
  });
  it('suggests the Bybit-style input by name', () => {
    expect(
      suggestMatch(input({ name: 'email', placeholder: 'Email', autocomplete: 'off' })),
    ).toEqual({ match: 'name', value: 'email' });
  });
});

describe('optional success tracking', () => {
  const rule = parseRule('https://qa.example.test/*');
  const base = {
    name: 'QA',
    loginUrl: 'https://qa.example.test/login',
    usernameSelector: '#user',
    passwordSelector: '#pass',
    successUrl: '',
    successKind: 'none' as const,
  };
  it('saves a profile with no success condition', () => {
    const profile = validateProfile(base, [rule], 1);
    expect(profile.success).toBeUndefined();
    expect(profile.usernameSelector).toBe('#user');
  });
  it('ignores the success URL entirely when tracking is off', () => {
    expect(
      validateProfile({ ...base, successUrl: 'https://other.example/nope' }, [rule], 1).success,
    ).toBeUndefined();
  });
  it('still validates the success URL when tracking is on', () => {
    expect(() =>
      validateProfile({ ...base, successKind: 'url', successUrl: '' }, [rule], 1),
    ).toThrow();
    expect(() =>
      validateProfile(
        { ...base, successKind: 'url', successUrl: 'https://qa.example.test/login' },
        [rule],
        1,
      ),
    ).toThrow('Success URL must differ from the login URL.');
    expect(
      validateProfile(
        { ...base, successKind: 'url', successUrl: 'https://qa.example.test/home' },
        [rule],
        1,
      ).success,
    ).toEqual({
      kind: 'url',
      route: { origin: 'https://qa.example.test', pathname: '/home', hash: '' },
    });
  });
  it('rejects an unsupported success condition', () => {
    expect(() => validateProfile({ ...base, successKind: 'maybe' as never }, [rule], 1)).toThrow(
      'Choose a supported success condition.',
    );
  });
  it('defaults title rules to an empty list and preserves valid per-origin rules', () => {
    expect(validateProfile(base, [rule], 1).titleRules).toEqual([]);
    expect(
      validateProfile(
        {
          ...base,
          titleRules: [
            { origin: 'https://qa.example.test', mode: 'contains', value: ' ＡＣＭＥ Console ' },
            { origin: 'https://qa.example.test', mode: 'equals', value: 'QA dashboard' },
          ],
        },
        [rule],
        1,
      ).titleRules,
    ).toEqual([
      { origin: 'https://qa.example.test', mode: 'contains', value: 'ＡＣＭＥ Console' },
      { origin: 'https://qa.example.test', mode: 'equals', value: 'QA dashboard' },
    ]);
  });
  it('rejects unsupported modes, empty normalized values, and origins outside login origins', () => {
    for (const titleRules of [
      [{ origin: 'https://qa.example.test', mode: 'regex', value: 'QA' }],
      [{ origin: 'https://qa.example.test', mode: 'contains', value: '　 ' }],
      [{ origin: 'https://other.example.test', mode: 'contains', value: 'QA' }],
    ])
      expect(() =>
        validateProfile({ ...base, titleRules: titleRules as never }, [rule], 1),
      ).toThrow();
  });
  it('rejects duplicate normalized title values per origin even across modes', () => {
    expect(() =>
      validateProfile(
        {
          ...base,
          titleRules: [
            { origin: 'https://qa.example.test', mode: 'contains', value: ' ACME ' },
            { origin: 'https://qa.example.test', mode: 'equals', value: 'ＡＣＭＥ' },
          ],
        },
        [rule],
        1,
      ),
    ).toThrow('duplicate');
  });
});

describe('multiple authorized environments', () => {
  const rules = parseDomainRules('https://app.example.test, https://staging.example.test');
  const base = {
    name: 'QA',
    loginUrl: 'https://app.example.test, https://staging.example.test',
    usernameSelector: '#user',
    passwordSelector: '#pass',
    successUrl: '',
    successKind: 'none' as const,
  };
  it('parses a comma or newline separated list', () => {
    expect(rules.map((r) => r.origin)).toEqual([
      'https://app.example.test',
      'https://staging.example.test',
    ]);
    expect(parseDomainRules('https://a.test\nhttps://b.test').map((r) => r.origin)).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });
  it('rejects duplicates and empty input', () => {
    expect(() => parseDomainRules('https://a.test, https://a.test')).toThrow('duplicate');
    expect(() => parseDomainRules('   ')).toThrow();
  });
  it('gives one profile every environment with shared selectors', () => {
    const profile = validateProfile(base, rules, 1);
    expect(profile.logins.map((l) => l.origin)).toEqual([
      'https://app.example.test',
      'https://staging.example.test',
    ]);
    expect(profile.usernameSelector).toBe('#user');
    expect(profile.passwordSelector).toBe('#pass');
  });
  it('rejects a login origin outside the catalog', () => {
    expect(() =>
      validateProfile(
        { ...base, loginUrl: 'https://app.example.test, https://other.test' },
        rules,
        1,
      ),
    ).toThrow('Login domain must match the imported catalog domain.');
  });
  it('matches any authorized origin', () => {
    const profile = validateProfile(base, rules, 1);
    expect(matchesAnyOrigin(profile.logins, 'https://staging.example.test/login')).toBe(true);
    expect(matchesAnyOrigin(profile.logins, 'https://app.example.test/x')).toBe(true);
    expect(matchesAnyOrigin(profile.logins, 'https://evil.test/login')).toBe(false);
    expect(matchesAnyRule(rules, 'https://staging.example.test/anything')).toBe(true);
    expect(matchesAnyRule(rules, 'https://nope.test/')).toBe(false);
  });
});

describe('legacy single-domain catalog migration', () => {
  it('rewrites a single catalogRule into catalogRules', () => {
    const legacy: Record<string, unknown> = {
      schemaVersion: 1,
      catalogRule: parseRule('https://legacy.example.test/*'),
      catalogRuleRevision: 1,
      accounts: [{ accountId: 'A1', username: 'u@e.test', password: 'p', metadata: {} }],
    };
    migrateVaultPayload(legacy);
    expect((legacy.catalogRules as CatalogRule[]).map((r) => r.origin)).toEqual([
      'https://legacy.example.test',
    ]);
    expect('catalogRule' in legacy).toBe(false);
  });
  it('treats a legacy empty catalog as no authorized domains', () => {
    const legacy: Record<string, unknown> = { catalogRule: null };
    migrateVaultPayload(legacy);
    expect(legacy.catalogRules).toEqual([]);
  });
  it('leaves an already-migrated payload untouched', () => {
    const current: Record<string, unknown> = {
      catalogRules: [parseRule('https://a.test/*'), parseRule('https://b.test/*')],
    };
    migrateVaultPayload(current);
    expect((current.catalogRules as CatalogRule[]).map((r) => r.origin)).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });
  it('round-trips a multi-origin vault through encrypt and decrypt', async () => {
    const salt = randomSalt();
    const key = await deriveVaultKey('synthetic-passphrase-only', salt);
    const payload = emptyVault();
    payload.catalogRules = parseDomainRules('https://app.test, https://staging.test');
    payload.accounts = [{ accountId: 'A1', username: 'u@e.test', password: 'p', metadata: {} }];
    const restored = await decryptVault(await encryptVault(payload, key, salt), key);
    expect(restored.catalogRules.map((r) => r.origin)).toEqual([
      'https://app.test',
      'https://staging.test',
    ]);
  });
});
