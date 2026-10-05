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
  await command(service, { type: 'SETUP', password: 'synthetic master password' });
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
  it('does not extend expiry from polling and fails closed without the alarm', async () => {
    const service = await setup();
    const original = (session.unlockedSession as { expiresAt: number }).expiresAt;
    await state(service);
    expect((session.unlockedSession as { expiresAt: number }).expiresAt).toBe(original);
    vi.spyOn(Date, 'now').mockReturnValue(original + 1);
    expect((await state(service)).locked).toBe(true);
    vi.restoreAllMocks();
  });
  it('extends inactivity only for explicit trusted interaction', async () => {
    const service = await setup();
    const original = (session.unlockedSession as { expiresAt: number }).expiresAt;
    const now = original - 800_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await state(service);
    expect((session.unlockedSession as { expiresAt: number }).expiresAt).toBe(original);
    const contentSender = {
      id: 'test',
      url: 'https://qa.example.com/login',
      tab: { id: 1 },
      frameId: 0,
      documentId: 'doc',
    } as chrome.runtime.MessageSender;
    expect((await service.handle({ type: 'TOUCH' }, contentSender)).ok).toBe(false);
    expect((session.unlockedSession as { expiresAt: number }).expiresAt).toBe(original);
    await command(service, { type: 'TOUCH' });
    expect((session.unlockedSession as { expiresAt: number }).expiresAt).toBe(now + 900_000);
    // A queued alarm from before the interaction must not lock the renewed session.
    await service.expireIfIdle();
    expect((await state(service)).locked).toBe(false);
    await service.lock();
    expect((await service.handle({ type: 'TOUCH' }, sender)).ok).toBe(false);
    expect(session.unlockedSession).toBeUndefined();
    vi.restoreAllMocks();
  });
  it('rolls back an in-flight storage write if locking wins', async () => {
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
    await service.lock();
    release();
    expect((await result).ok).toBe(false);
    expect(JSON.stringify(local)).toBe(before);
    expect((await state(service)).locked).toBe(true);
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
  it('redacts unknown storage exceptions and expires a session during state lookup', async () => {
    const service = await setup();
    await importAccount(service);
    const p = await preview(service);
    vi.mocked(chrome.storage.local.set as unknown as () => Promise<void>).mockRejectedValueOnce(
      new Error('private imported payload'),
    );
    const result = await service.handle({ type: 'COMMIT_IMPORT', token: p.token }, sender);
    expect(JSON.stringify(result)).not.toContain('private imported payload');
    const expiry = (session.unlockedSession as { expiresAt: number }).expiresAt;
    vi.mocked(chrome.tabs.query as unknown as () => Promise<unknown[]>).mockImplementationOnce(
      async () => {
        vi.spyOn(Date, 'now').mockReturnValue(expiry + 1);
        return [];
      },
    );
    const locked = await state(service);
    expect(locked.locked).toBe(true);
    expect(locked.accounts).toHaveLength(0);
    vi.restoreAllMocks();
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
  it('preserves encrypted storage after a wrong unlock and expires Undo', async () => {
    const service = await setup();
    await importAccount(service);
    const original = JSON.stringify(local);
    await service.lock();
    expect(
      (await service.handle({ type: 'UNLOCK', password: 'incorrect synthetic password' }, sender))
        .ok,
    ).toBe(false);
    expect(JSON.stringify(local)).toBe(original);
    await command(service, { type: 'UNLOCK', password: 'synthetic master password' });
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
