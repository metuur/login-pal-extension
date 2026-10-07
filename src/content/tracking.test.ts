import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { Attempt, ContentInstruction, LoginProfile } from '../shared/types';
const profile: LoginProfile = {
  id: 'qa',
  revision: 1,
  approvedCatalogRuleRevision: 1,
  name: 'QA',
  logins: [{ origin: 'https://qa.example.test', pathname: '/login', hash: '' }],
  usernameSelector: '#user',
  passwordSelector: '#pass',
  success: {
    kind: 'url',
    route: { origin: 'https://qa.example.test', pathname: '/dashboard', hash: '' },
  },
};
let dom: JSDOM | undefined;
afterEach(() => {
  dom?.window.close();
  vi.unstubAllGlobals();
  delete (globalThis as { __accountLoginAssistantContent?: boolean }).__accountLoginAssistantContent;
  vi.resetModules();
});
it('cancels edits made immediately after fill acknowledgement without a later TRACK message', async () => {
  dom = new JSDOM('<input id="user"><input id="pass" type="password">', {
    url: 'https://qa.example.test/login',
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'getClientRects', {
    value: () => [{ width: 100, height: 20 }],
  });
  for (const name of ['window', 'document', 'location', 'Element', 'MutationObserver'] as const)
    vi.stubGlobal(name, dom.window[name]);
  let listener: (
    message: ContentInstruction,
    sender: unknown,
    reply: (value: unknown) => void,
  ) => void = () => {};
  let current: Attempt | null = null;
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'fixture',
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
      sendMessage: async (message: { type: string }) => {
        if (message.type === 'CANCEL_ATTEMPT') current = null;
        return { ok: true, data: { profile, attempt: current } };
      },
    },
  });
  await import('./index');
  const attempt: Attempt = {
    token: 'test',
    tabId: 1,
    documentId: 'doc',
    profileId: 'qa',
    profileRevision: 1,
    catalogRevision: 1,
    accountId: 'ACC',
    createdAt: Date.now(),
    expiresAt: Date.now() + 120000,
    acknowledged: false,
  };
  current = attempt;
  let acknowledged = false;
  listener(
    {
      type: 'FILL_FIELDS',
      profile,
      username: 'synthetic-user',
      password: 'synthetic-value',
      attempt,
    },
    { id: 'fixture' },
    (reply) => {
      acknowledged = !!(reply as { ok: boolean }).ok;
    },
  );
  expect(acknowledged).toBe(true);
  const field = dom.window.document.querySelector<HTMLInputElement>('#user')!;
  field.value = 'edited account';
  field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(current === null).toBe(true);
});
