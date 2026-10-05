import { GroupService } from '../src/background/groups';
import type { Reply } from '../src/shared/types';
import { version } from '../package.json';
import sampleCsv from '../public/sample-accounts.csv?url';

type Listener = (event: unknown) => void;
export interface PreviewBridge {
  send(message: unknown, page: string): Promise<Reply>;
  listeners: Set<Listener>;
  api: typeof chrome;
}
declare global {
  interface Window {
    __previewBridge?: PreviewBridge;
  }
}

function area(storage: Storage, key: string) {
  const read = (): Record<string, unknown> => JSON.parse(storage.getItem(key) ?? '{}');
  return {
    async setAccessLevel() {},
    async get(keys?: string | string[] | null) {
      const data = read();
      return keys == null
        ? data
        : Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((name) => [name, data[name]]),
          );
    },
    async set(value: Record<string, unknown>) {
      storage.setItem(key, JSON.stringify({ ...read(), ...value }));
    },
    async remove(keys: string | string[]) {
      const data = read();
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
      storage.setItem(key, JSON.stringify(data));
    },
  };
}

export function createBridge(): PreviewBridge {
  if (window.__previewBridge) return window.__previewBridge;
  const listeners = new Set<Listener>();
  const registrations = new Map<string, unknown>();
  const grants = new Set<string>(
    JSON.parse(localStorage.getItem('onechat-preview-permissions') ?? '[]'),
  );
  const api = {
    storage: {
      local: area(localStorage, 'onechat-preview-local'),
      session: area(sessionStorage, 'onechat-preview-session'),
    },
    runtime: {
      id: 'onechat-preview',
      getURL: (path: string) =>
        path === 'sample-accounts.csv' ? sampleCsv : new URL(path, location.origin + '/').href,
      getManifest: () => ({ version }),
      async sendMessage(event: unknown) {
        for (const listener of listeners) listener(event);
      },
    },
    permissions: {
      async request({ origins }: { origins: string[] }) {
        origins.forEach((origin) => grants.add(origin));
        localStorage.setItem('onechat-preview-permissions', JSON.stringify([...grants]));
        return true;
      },
      async contains({ origins }: { origins: string[] }) {
        return origins.every((origin) => grants.has(origin));
      },
      async getAll() {
        return { origins: [...grants] };
      },
      async remove({ origins }: { origins: string[] }) {
        origins.forEach((origin) => grants.delete(origin));
        localStorage.setItem('onechat-preview-permissions', JSON.stringify([...grants]));
        return true;
      },
    },
    scripting: {
      async getRegisteredContentScripts({ ids }: { ids?: string[] } = {}) {
        return [...registrations]
          .filter(([id]) => !ids || ids.includes(id))
          .map(([, value]) => value);
      },
      async registerContentScripts(scripts: { id: string }[]) {
        scripts.forEach((script) => registrations.set(script.id, script));
      },
      async unregisterContentScripts({ ids }: { ids?: string[] } = {}) {
        for (const id of ids ?? registrations.keys()) registrations.delete(id);
      },
      async executeScript() {
        throw new Error('Autofill requires the installed Chrome extension.');
      },
    },
    tabs: {
      async query() {
        return [];
      },
      async get() {
        throw new Error('No authorized browser tab in localhost preview.');
      },
      async getCurrent() {
        return undefined;
      },
      async create({ url }: { url: string }) {
        window.dispatchEvent(new CustomEvent('preview-navigate', { detail: url }));
      },
    },
  } as unknown as typeof chrome;
  Object.defineProperty(globalThis, 'chrome', { value: api, configurable: true });
  const service = new GroupService();
  const bridge: PreviewBridge = {
    api,
    listeners,
    async send(message, page) {
      if ((message as { type?: string })?.type === 'FILL')
        return { ok: false, error: 'Autofill requires the installed Chrome extension.' };
      try {
        return await service.handle(message, { id: api.runtime.id, url: api.runtime.getURL(page) });
      } catch {
        return { ok: false, error: 'The local preview could not complete this action.' };
      }
    },
  };
  window.__previewBridge = bridge;
  return bridge;
}

export function installPageBridge(page: 'popup.html' | 'options.html') {
  const bridge = window.parent !== window ? window.parent.__previewBridge! : createBridge();
  const listeners = new Set<Listener>();
  const api = {
    ...bridge.api,
    runtime: {
      ...bridge.api.runtime,
      sendMessage: (message: unknown) => bridge.send(message, page),
      onMessage: {
        addListener(listener: Listener) {
          listeners.add(listener);
          bridge.listeners.add(listener);
        },
      },
    },
  };
  Object.defineProperty(globalThis, 'chrome', { value: api, configurable: true });
  window.addEventListener('pagehide', () => {
    for (const listener of listeners) bridge.listeners.delete(listener);
  });
}
