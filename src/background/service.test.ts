import { GroupService } from './groups';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantService } from './service';
import type { AppState, Command, ImportPreview, Reply } from '../shared/types';
const sender = { id: 'test', url: 'chrome-extension://test/options.html' };
let local: Record<string, unknown>, session: Record<string, unknown>, failWrite: boolean;
let gate: (() => Promise<void>) | null;
const area = (data: () => Record<string, unknown>, persistent = false) => ({
  setAccessLevel: vi.fn(async () => {}),
  get: vi.fn(async () => structuredClone(data())),
  set: vi.fn(async (value: Record<string, unknown>) => {
    if (persistent && failWrite) throw new Error('quota');
    if (persistent && gate) await gate();
    Object.assign(data(), structuredClone(value));
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete data()[key];
  }),
});
async function command<T>(service: AssistantService, cmd: Command): Promise<T> {
  const result = await service.handle(
    cmd,
    cmd.type === 'FILL' ? { ...sender, url: 'chrome-extension://test/popup.html' } : sender,
  );
  if (!result.ok) throw new Error(result.error);
  return result.data as T;
}
async function setup() {
  const service = new AssistantService();
  await service.ready;
  return service;
}
async function preview(service: AssistantService, name = 'A') {
  return command<ImportPreview>(service, {
    type: 'PREVIEW_IMPORT',
    bytes: [
      ...new TextEncoder().encode(
        `account_id,username,password\n${name},test@example.invalid,synthetic-only`,
      ),
    ],
    rule: 'https://qa.example.com/*',
    mode: 'replace',
  });
}
async function importAccount(service: AssistantService, name = 'A') {
  const p = await preview(service, name);
  await command(service, { type: 'COMMIT_IMPORT', token: p.token });
}
async function state(service: AssistantService) {
  return command<AppState>(service, { type: 'STATE' });
}
beforeEach(() => {
  local = {};
  session = {};
  failWrite = false;
  gate = null;
  vi.stubGlobal('chrome', {
    storage: { local: area(() => local, true), session: area(() => session) },
    runtime: {
      id: 'test',
      getURL: (s: string) => `chrome-extension://test/${s}`,
      getManifest: () => ({ version: '1.0.0' }),
      sendMessage: vi.fn(async () => {}),
    },
    alarms: { create: vi.fn(async () => {}), clear: vi.fn(async () => {}) },
    tabs: {
      query: vi.fn(async () => []),
      get: vi.fn(async (id: number) => ({ id, active: true, url: 'https://qa.example.com/login' })),
      sendMessage: vi.fn(async () => ({ ok: true, baseline: false })),
    },
    permissions: {
      contains: vi.fn(async () => true),
      getAll: vi.fn(async () => ({ origins: [] })),
      remove: vi.fn(async () => true),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => []),
      unregisterContentScripts: vi.fn(async () => {}),
      registerContentScripts: vi.fn(async () => {}),
      executeScript: vi.fn(async () => [
        { frameId: 0, documentId: 'doc', result: 'https://qa.example.com/login' },
      ]),
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('worker credential and transaction boundary', () => {
  it('accepts packaged options pages in tabs but restricts autofill to the popup', async () => {
    const service = await setup();
    const tabSender = { ...sender, tab: { id: 1 } } as chrome.runtime.MessageSender;
    expect((await service.handle({ type: 'STATE' }, tabSender)).ok).toBe(true);
    expect((await service.handle({ type: 'FILL', accountId: 'A' }, tabSender)).ok).toBe(false);
  });
  it('rejects content scripts and forged extension URLs requesting account data', async () => {
    const service = await setup();
    for (const bad of [
      { id: 'test', url: 'https://evil.invalid', tab: { id: 1 }, frameId: 0, documentId: 'doc' },
      { id: 'test', url: 'chrome-extension://test/options.html.evil' },
    ])
      expect(
        (await service.handle({ type: 'STATE' }, bad as chrome.runtime.MessageSender)).ok,
      ).toBe(false);
  });
  it('commits ciphertext only and returns password-free summaries', async () => {
    const service = await setup();
    await importAccount(service);
    expect((await state(service)).total).toBe(1);
    expect(JSON.stringify(local)).not.toContain('synthetic-only');
    expect(JSON.stringify(await state(service))).not.toContain('synthetic-only');
  });
  it('preserves a committed catalog when storage fails and permits retry', async () => {
    const service = await setup();
    await importAccount(service);
    const before = JSON.stringify(local);
    const p = await preview(service, 'B');
    failWrite = true;
    expect((await service.handle({ type: 'COMMIT_IMPORT', token: p.token }, sender)).ok).toBe(
      false,
    );
    expect(JSON.stringify(local)).toBe(before);
    failWrite = false;
    await command(service, { type: 'COMMIT_IMPORT', token: p.token });
    expect((await state(service)).accounts[0].accountId).toBe('B');
  });
  it('persists encrypted delete Undo across worker suspension and consumes it', async () => {
    let service = await setup();
    await importAccount(service);
    await command(service, { type: 'DELETE', accountId: 'A' });
    expect((await state(service)).undoAvailable).toBe(true);
    expect(JSON.stringify(session)).not.toContain('synthetic-only');
    service = new AssistantService();
    await service.ready;
    await command(service, { type: 'UNDO' });
    expect((await state(service)).total).toBe(1);
    expect((await state(service)).undoAvailable).toBe(false);
  });
  it('invalidates stale previews and Undo on purge', async () => {
    const service = await setup();
    await importAccount(service);
    const p = await preview(service, 'B');
    await command(service, { type: 'DELETE', accountId: 'A' });
    expect((await service.handle({ type: 'COMMIT_IMPORT', token: p.token }, sender)).ok).toBe(
      false,
    );
    await command(service, { type: 'PURGE' });
    expect((await service.handle({ type: 'UNDO' }, sender)).ok).toBe(false);
  });
  it('opens automatically and stays available after inactivity and browser restart', async () => {
    let service = await setup();
    await importAccount(service);
    expect((await state(service)).migrationRequired).toBe(false);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400_000);
    expect((await state(service)).total).toBe(1);
    session = {};
    service = new AssistantService();
    await service.ready;
    expect((await state(service)).migrationRequired).toBe(false);
    expect((await state(service)).total).toBe(1);
    expect((await service.handle({ type: 'LOCK' }, sender)).ok).toBe(false);
    expect(chrome.alarms.create).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('migrates an older catalog once without losing accounts or overwriting failed attempts', async () => {
    const { deriveVaultKey, encryptVault } = await import('../domain/crypto');
    const service = await setup();
    await importAccount(service);
    const { decryptVault } = await import('../domain/crypto');
    const envelope = local.vault as import('../shared/types').Envelope;
    const payload = await decryptVault(envelope, local.catalogKey as string);
    const legacyKey = await deriveVaultKey('old synthetic password', envelope.salt);
    local.vault = await encryptVault(payload, legacyKey, envelope.salt);
    delete local.catalogKey;
    session = {};
    const legacy = new AssistantService();
    await legacy.ready;
    expect((await state(legacy)).migrationRequired).toBe(true);
    const before = JSON.stringify(local);
    expect((await legacy.handle({ type: 'MIGRATE', password: 'wrong' }, sender)).ok).toBe(false);
    expect(JSON.stringify(local)).toBe(before);
    await command(legacy, { type: 'MIGRATE', password: 'old synthetic password' });
    expect((await state(legacy)).total).toBe(1);
    session = {};
    const restarted = new AssistantService();
    await restarted.ready;
    expect((await state(restarted)).migrationRequired).toBe(false);
    expect((await state(restarted)).total).toBe(1);
  });
  it('rolls back an in-flight storage write if session invalidation wins', async () => {
    const service = await setup();
    await importAccount(service);
    const before = JSON.stringify(local);
    const p = await preview(service, 'B');
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    gate = async () => {
      gate = null;
      entered();
      await blocked;
    };
    const result = service.handle({ type: 'COMMIT_IMPORT', token: p.token }, sender);
    await waiting;
    await service.invalidateSession();
    release();
    expect((await result).ok).toBe(false);
    expect(JSON.stringify(local)).toBe(before);
    expect((await state(service)).migrationRequired).toBe(true);
  });
  it('reports bounded safe validation errors without echoing imported text', async () => {
    const service = await setup();
    for (const csv of [
      'wrong,user,secret\nprivate,private,private',
      'account_id,username,password,password\nprivate,private,private,private',
    ]) {
      const result = await service.handle(
        {
          type: 'PREVIEW_IMPORT',
          bytes: [...new TextEncoder().encode(csv)],
          rule: 'https://qa.example.com/*',
          mode: 'merge',
        },
        sender,
      );
      expect(result).toEqual({
        ok: false,
        error: 'CSV requires unique headers: account_id, username, password (100 columns maximum).',
      });
    }
    await importAccount(service);
    const result = await service.handle(
      {
        type: 'PREVIEW_IMPORT',
        bytes: [
          ...new TextEncoder().encode(
            'account_id,username,password\nB,test@example.invalid,synthetic-only',
          ),
        ],
        rule: 'https://another.example.com/*',
        mode: 'merge',
      },
      sender,
    );
    expect(result).toEqual({
      ok: false,
      error: 'Use Wipe & Replace to change the catalog URL rule.',
    });
  });
  it('redacts unknown storage exceptions', async () => {
    const service = await setup();
    await importAccount(service);
    const p = await preview(service);
    vi.mocked(chrome.storage.local.set as unknown as () => Promise<void>).mockRejectedValueOnce(
      new Error('private imported payload'),
    );
    const result = await service.handle({ type: 'COMMIT_IMPORT', token: p.token }, sender);
    expect(JSON.stringify(result)).not.toContain('private imported payload');
  });
  it('never sends credentials after permission removal during inspection', async () => {
    const service = await setup();
    await importAccount(service);
    await command(service, {
      type: 'SAVE_PROFILE',
      profile: {
        name: 'QA',
        loginUrl: 'https://qa.example.com/login',
        usernameSelector: '#u',
        passwordSelector: '#p',
        successKind: 'url',
        successUrl: 'https://qa.example.com/done',
      },
    });
    const messages: string[] = [];
    vi.mocked(
      chrome.tabs.sendMessage as unknown as (
        id: number,
        message: { type: string },
      ) => Promise<unknown>,
    ).mockImplementation(async (_id, message) => {
      messages.push(message.type);
      if (message.type === 'INSPECT') await service.permissionRemoved();
      return { ok: true };
    });
    expect(
      (
        await service.handle(
          { type: 'FILL', accountId: 'A', tabId: 1 },
          { ...sender, url: 'chrome-extension://test/popup.html' },
        )
      ).ok,
    ).toBe(false);
    expect(messages).not.toContain('FILL_FIELDS');
  });
  it('does not resurrect a cancelled attempt after the fill acknowledgment', async () => {
    const service = await setup();
    await importAccount(service);
    await command(service, {
      type: 'SAVE_PROFILE',
      profile: {
        name: 'QA',
        loginUrl: 'https://qa.example.com/login',
        usernameSelector: '#u',
        passwordSelector: '#p',
        successKind: 'url',
        successUrl: 'https://qa.example.com/done',
      },
    });
    vi.mocked(
      chrome.tabs.sendMessage as unknown as (
        id: number,
        message: { type: string; attempt?: { token: string } },
      ) => Promise<unknown>,
    ).mockImplementation(async (_id, message) => {
      if (message.type === 'FILL_FIELDS')
        await service.handle(
          { type: 'CANCEL_ATTEMPT', token: message.attempt!.token },
          {
            id: 'test',
            url: 'https://qa.example.com/login',
            tab: { id: 1 } as chrome.tabs.Tab,
            frameId: 0,
            documentId: 'doc',
          },
        );
      return { ok: true };
    });
    expect(
      (
        await service.handle(
          { type: 'FILL', accountId: 'A', tabId: 1 },
          { ...sender, url: 'chrome-extension://test/popup.html' },
        )
      ).ok,
    ).toBe(false);
    expect((session.unlockedSession as { attempts: unknown[] }).attempts).toHaveLength(0);
  });
  it('expires Undo without making the catalog unavailable', async () => {
    const service = await setup();
    await importAccount(service);
    await command(service, { type: 'DELETE', accountId: 'A' });
    const expired = Date.now() + 31_000;
    vi.spyOn(Date, 'now').mockReturnValue(expired);
    expect((await service.handle({ type: 'UNDO' }, sender)).ok).toBe(false);
    expect((await state(service)).total).toBe(0);
    vi.restoreAllMocks();
  });
  it('keeps independent tab attempts valid after another tab writes success history', async () => {
    const service = await setup();
    await importAccount(service);
    await command(service, {
      type: 'SAVE_PROFILE',
      profile: {
        name: 'QA',
        loginUrl: 'https://qa.example.com/login',
        usernameSelector: '#u',
        passwordSelector: '#p',
        successKind: 'url',
        successUrl: 'https://qa.example.com/done',
      },
    });
    await command(service, { type: 'FILL', accountId: 'A', tabId: 1 });
    await command(service, { type: 'FILL', accountId: 'A', tabId: 2 });
    const attempts = (session.unlockedSession as { attempts: { token: string; tabId: number }[] })
      .attempts;
    expect(attempts).toHaveLength(2);
    vi.mocked(
      chrome.scripting.executeScript as unknown as () => Promise<unknown>,
    ).mockResolvedValue([
      { frameId: 0, documentId: 'success-doc', result: 'https://qa.example.com/done' },
    ]);
    for (const attempt of attempts) {
      const result: Reply = await service.handle(
        { type: 'SUCCESS_OBSERVED', token: attempt.token },
        {
          id: 'test',
          url: 'https://qa.example.com/done',
          tab: { id: attempt.tabId } as chrome.tabs.Tab,
          frameId: 0,
          documentId: 'success-doc',
        },
      );
      expect(result.ok).toBe(true);
    }
    expect((await state(service)).lastSuccessful?.accountId).toBe('A');
    expect((session.unlockedSession as { attempts: unknown[] }).attempts).toHaveLength(0);
  });
});

describe('named CSV groups', () => {
  async function run<T = AppState>(
    service: GroupService,
    data: Record<string, unknown>,
  ): Promise<T> {
    const result = await service.handle(data, sender);
    if (!result.ok) throw new Error(result.error);
    return result.data as T;
  }
  async function ingest(
    service: GroupService,
    groupId: string,
    ids: string[],
    mode = 'merge',
    rule = 'https://qa.example.com/*',
  ) {
    const p = await run<ImportPreview>(service, {
      type: 'PREVIEW_IMPORT',
      groupId,
      mode,
      rule,
      bytes: [
        ...new TextEncoder().encode(
          'account_id,username,password\n' +
            ids.map((id) => `${id},synthetic@example.test,synthetic-only`).join('\n'),
        ),
      ],
    });
    await run(service, { type: 'COMMIT_IMPORT', groupId, token: p.token });
  }
  it('isolates duplicate IDs, merge, replace, purge, domains and restart by group', async () => {
    let service = new GroupService();
    await service.ready;
    const group = await run<{ id: string }>(service, { type: 'CREATE_GROUP', name: 'Performance' });
    await ingest(service, 'default', ['A']);
    await ingest(service, group.id, ['A'], 'merge', 'https://performance.example.com/*');
    await ingest(service, 'default', ['B']);
    expect((await run(service, { type: 'STATE' })).total).toBe(2);
    const { parseCsv } = await import('../domain/csv');
    const exported = await run<string>(service, { type: 'EXPORT_CSV', groupId: group.id });
    const rows = parseCsv(new TextEncoder().encode(exported));
    expect(rows.valid).toBe(1);
    expect(rows.accounts[0].accountId).toBe('A');
    expect(
      (
        await service.handle(
          { type: 'EXPORT_CSV', groupId: group.id },
          { ...sender, url: 'chrome-extension://test/popup.html' },
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await service.handle({ type: 'EXPORT_CSV', groupId: group.id }, {
          id: 'test',
          url: 'https://qa.example.com',
          tab: { id: 1 },
          frameId: 0,
          documentId: 'doc',
        } as chrome.runtime.MessageSender)
      ).ok,
    ).toBe(false);

    expect((await run(service, { type: 'STATE', groupId: group.id })).total).toBe(1);
    expect((await run(service, { type: 'STATE', groupId: group.id })).rule).toBe(
      'https://performance.example.com/*',
    );
    await ingest(service, 'default', ['C'], 'replace');
    expect((await run(service, { type: 'STATE', groupId: group.id })).accounts[0].accountId).toBe(
      'A',
    );
    await run(service, { type: 'PURGE', groupId: 'default' });
    expect((await run(service, { type: 'STATE', groupId: group.id })).total).toBe(1);
    session = {};
    service = new GroupService();
    await service.ready;
    expect((await run(service, { type: 'STATE', groupId: group.id })).total).toBe(1);
    expect((await run(service, { type: 'STATE' })).total).toBe(0);
  });
  it('preserves a shared host permission when another group still uses it', async () => {
    const service = new GroupService();
    await service.ready;
    const group = await run<{ id: string }>(service, { type: 'CREATE_GROUP', name: 'Second QA' });
    for (const groupId of ['default', group.id]) {
      await ingest(service, groupId, ['A']);
      await run(service, {
        type: 'SAVE_PROFILE',
        groupId,
        profile: {
          name: 'QA',
          loginUrl: 'https://qa.example.com/login',
          usernameSelector: '#user',
          passwordSelector: '#password',
          successKind: 'url',
          successUrl: 'https://qa.example.com/done',
        },
      });
    }
    vi.mocked(chrome.permissions.remove).mockClear();
    await run(service, { type: 'RESET', groupId: 'default' });
    expect(chrome.permissions.remove).not.toHaveBeenCalled();
    expect((await run(service, { type: 'STATE', groupId: group.id })).profile?.name).toBe('QA');
    expect((await run(service, { type: 'STATE', groupId: group.id })).total).toBe(1);
  });
  it('rejects cross-group preview tokens and unauthorized group enumeration', async () => {
    const service = new GroupService();
    await service.ready;
    const group = await run<{ id: string }>(service, { type: 'CREATE_GROUP', name: 'Platform B' });
    const p = await run<ImportPreview>(service, {
      type: 'PREVIEW_IMPORT',
      groupId: 'default',
      mode: 'merge',
      rule: 'https://qa.example.com/*',
      bytes: [
        ...new TextEncoder().encode('account_id,username,password\nA,demo@example.test,synthetic'),
      ],
    });
    expect(
      (await service.handle({ type: 'COMMIT_IMPORT', groupId: group.id, token: p.token }, sender))
        .ok,
    ).toBe(false);
    expect(
      (
        await service.handle({ type: 'STATE', groupId: group.id }, {
          id: 'test',
          url: 'https://qa.example.com',
          tab: { id: 1 },
          frameId: 0,
          documentId: 'doc',
        } as chrome.runtime.MessageSender)
      ).ok,
    ).toBe(false);
    expect((await service.handle({ type: 'CREATE_GROUP', name: 'platform b' }, sender)).ok).toBe(
      false,
    );
    await run(service, { type: 'RENAME_GROUP', groupId: group.id, name: 'QA Platform X' });
    expect((await run(service, { type: 'STATE', groupId: group.id })).groupName).toBe(
      'QA Platform X',
    );
  });
});
