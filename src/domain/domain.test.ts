import { exportCsv as serializeAccounts } from './csv';
import { describe, it, expect } from 'vitest';
import {
  deriveVaultKey,
  randomSalt,
  encryptVault,
  decryptVault,
  sealValue,
  unsealValue,
} from './crypto';
import { parseCsv } from './csv';
import {
  parseRule,
  parseDomainRule,
  parseRoute,
  matchesRule,
  matchesRoute,
  validateProfile,
} from './rules';
import { emptyVault, planImport } from './import';
import { searchAccounts } from './search';
const csv = (s: string) => parseCsv(new TextEncoder().encode(s));
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
      'http://qa.example.com/*',
      'https://*.example.com/*',
      'https://u:p@qa.example.com/*',
      'https://qa.example.com/a*b',
      'https://qa.example.com/*?q=*',
      'https://qa.example.com/*#*',
    ])
      expect(() => parseRule(u)).toThrow();
    expect(parseRule('https://qa.example.com/%2A').pathMatch).toBe('exact');
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
      validateProfile(p, parseRule('https://qa.example.com/login*'), 2).approvedCatalogRuleRevision,
    ).toBe(2);
    expect(() =>
      validateProfile({ ...p, successUrl: p.loginUrl }, parseRule('https://qa.example.com/*'), 2),
    ).toThrow();
  });
});
describe('transaction planning', () => {
  it('merges complete records and invalidates credential history', () => {
    const rule = parseRule('https://qa.example.com/*');
    const a = planImport(emptyVault(), csv(header + '\na,u,p,c\nb,v,p,c'), rule, 'merge').payload;
    a.history.p = {
      lastSuccessfulAccountId: 'a',
      lastSuccessfulAt: 10,
      recentAccountIds: ['a', 'b'],
    };
    const r = planImport(a, csv(header + '\na,u,new,d'), rule, 'merge');
    expect(r.counts).toEqual({ added: 0, updated: 1, removed: 0, unchanged: 0 });
    expect(r.payload.accounts).toHaveLength(2);
    expect(r.payload.history.p?.lastSuccessfulAt).toBeNull();
    expect(a.history.p.lastSuccessfulAt).toBe(10);
    expect(() =>
      planImport(a, csv(header + '\nx,u,p,c'), parseRule('https://other.example/*'), 'merge'),
    ).toThrow();
  });
  it('replace clears rule history and counts removed IDs', () => {
    const a = planImport(
      emptyVault(),
      csv(header + '\na,u,p,c'),
      parseRule('https://qa.example.com/*'),
      'replace',
    ).payload;
    const r = planImport(
      a,
      csv(header + '\nb,u,p,c'),
      parseRule('https://other.example/*'),
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
    initial.catalogRule = parseRule('https://qa.example.com/*');
    initial.accounts = Array.from({ length: 10000 }, (_, i) => ({
      accountId: String(i),
      username: 'u',
      password: 'p',
      metadata: {},
    }));
    expect(() =>
      planImport(initial, csv(header + '\nnew,u,p,c'), initial.catalogRule!, 'merge'),
    ).toThrow('10,000');
    expect(initial.accounts.length).toBe(10000);
  });
  it('supports a populated encrypted vault and rejects wrong keys', async () => {
    const salt = randomSalt(),
      key = await deriveVaultKey('synthetic test master', salt);
    const payload = planImport(
      emptyVault(),
      csv(header + '\na,u,p,c'),
      parseRule('https://qa.example.com/*'),
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
    expect(r.diagnostics.map((d) => d.row)).toEqual([2, 3]);
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
      rule,
      'merge',
    ).payload;
    current.history.profile = {
      lastSuccessfulAccountId: 'a',
      lastSuccessfulAt: 10,
      recentAccountIds: ['b', 'a'],
    };
    const changed = planImport(current, csv(header + '\na,u,p,changed'), rule, 'replace');
    expect(changed.payload.history.profile).toEqual({
      lastSuccessfulAccountId: 'a',
      lastSuccessfulAt: 10,
      recentAccountIds: ['a'],
    });
    const removed = planImport(current, csv(header + '\nb,u,p,c'), rule, 'replace');
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
    parseRule('https://qa.example.com/old'),
    'merge',
  ).payload;
  const next = planImport(existing, csv(header + '\nb,u,p,c'), rule, 'merge');
  expect(next.payload.accounts).toHaveLength(2);
  expect(next.payload.catalogRuleRevision).toBe(existing.catalogRuleRevision);
});
