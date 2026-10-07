import type {
  Account,
  AppState,
  Attempt,
  Command,
  ContentContext,
  ContentRequest,
  DetectedInput,
  DetectResult,
  DetectTab,
  Envelope,
  FillResult,
  ImportPreview,
  LoginProfile,
  ProfileHistory,
  Reply,
  Route,
  VaultPayload,
} from '../shared/types';
import {
  randomSalt,
  deriveVaultKey,
  encryptVault,
  decryptVault,
  sealValue,
  unsealValue,
} from '../domain/crypto';
import {
  parseDomainRule,
  parseDomainRules,
  formatRule,
  matchesRule,
  matchesAnyRule,
  matchesRoute,
  matchesAnyOrigin,
  validateProfile,
  isAuthorizedPageUrl,
} from '../domain/rules';
import { parseCsv, exportCsv } from '../domain/csv';
import { planImport } from '../domain/import';
import { searchAccounts } from '../domain/search';

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const empty = (): VaultPayload => ({
  schemaVersion: 1,
  revision: 0,
  snapshotRevision: 0,
  catalogRules: [],
  catalogRuleRevision: 0,
  accounts: [],
  history: {},
});
const history = (): ProfileHistory => ({
  lastSuccessfulAccountId: null,
  lastSuccessfulAt: null,
  recentAccountIds: [],
});
type Undo = {
  sealed: Awaited<ReturnType<typeof sealValue>>;
  expiresAt: number;
  revision: number;
  rule: string | null;
};
type Session = { key: string; attempts: Attempt[]; undo: Undo | null };
type Preview = { public: ImportPreview; payload: VaultPayload; revision: number };
// @spec R-1.1..R-1.9, R-3.1..R-3.6: worker owns the encrypted vault and session.
/**
 * Profiles are stored outside the encrypted vault, so they need their own
 * migration: pre-multi-environment records carry a single `login` route.
 */
function migrateProfile(stored: unknown): LoginProfile | null {
  if (!stored || typeof stored !== 'object') return null;
  const record = stored as LoginProfile & { login?: Route };
  if (!Array.isArray(record.logins)) {
    if (!record.login) return null;
    record.logins = [record.login];
  }
  delete record.login;
  return record.logins.length ? record : null;
}
/** The popup shows only the handful of accounts the user actually alternates between. */
const RECENT_LIMIT = 2;
const ACCOUNT_NOT_IN_GROUP = 'That account is not in the selected CSV group.';
const DETECT_OFF_DOMAIN = 'Open the imported catalog domain in that tab, then detect again.';
const DETECT_NO_TAB = 'No open tab is on the approved login domain.';
const RULE_UNCHANGED = "That is already this group's authorized domain.";
// Autofill refuses for several distinct reasons the user can act on. Each is a
// state Settings already shows, so naming it leaks nothing a trusted extension
// page cannot already read, and a bare failure leaves the user guessing.
const FILL_NO_PROFILE = 'Save a login profile in Settings before autofill.';
const FILL_STALE_PROFILE =
  "The group's domains changed. Open Login page setup and save the profile again.";
const FILL_NO_PERMISSION =
  'Website permission is missing. Open Login page setup and save the profile again to grant it.';
const FILL_TAB_INACTIVE = 'Open the popup on the tab you want to fill.';
const FILL_OFF_CATALOG = 'That tab is not on a domain this CSV group authorizes.';
const FILL_OFF_PROFILE =
  'That tab is not on a login domain saved in this profile. Open Login page setup, add the domain and save.';
const FILL_NO_FIELDS =
  'The login fields were not found on that page. Check the match values, or detect them again.';
const FILL_ALREADY_SUCCESS =
  'That page already shows the success condition, so no credentials were sent.';
const SAFE_ERRORS = new Set<string>([
  FILL_NO_PROFILE,
  FILL_STALE_PROFILE,
  FILL_NO_PERMISSION,
  FILL_TAB_INACTIVE,
  FILL_OFF_CATALOG,
  FILL_OFF_PROFILE,
  FILL_NO_FIELDS,
  FILL_ALREADY_SUCCESS,
  ACCOUNT_NOT_IN_GROUP,
  DETECT_OFF_DOMAIN,
  DETECT_NO_TAB,
  RULE_UNCHANGED,
  'Import needs at least one valid account.',
  'Choose a supported import mode.',
  'Use Wipe & Replace to change the catalog URL rule.',
  'The resulting catalog exceeds 10,000 accounts.',
  'Enter a valid authorized http:// or https:// URL.',
  'Login URL must match the imported catalog rule.',
  'Login and success URLs must share one origin.',
  'Choose a supported success condition.',
  'Success URL must differ from the login URL.',
  'Enter a valid field selector.',
  'Choose distinct username and password fields.',
  'Choose a supported field matching method.',
  'Enter a profile name and import a catalog first.',
  'Unable to unlock vault.',
  'Vault exceeds the 5 MiB encrypted storage limit.',
  'Unable to encrypt vault.',
  'Unable to secure temporary data.',
  'Unable to restore temporary data.',
  'CSV has malformed quoting.',
  'CSV exceeds the 2 MiB file limit.',
  'CSV must use valid UTF-8.',
  'CSV requires unique headers: account_id, username, password (100 columns maximum).',
  'CSV exceeds 10,000 rows or 100 columns.',
  'Catalog unavailable. Migrate the previous catalog or reset it.',
  'Profile could not be saved.',
]);
export class AssistantService {
  private generation = 0;
  private authorizationRevision = 0;
  private session: Session | null = null;
  private payload: VaultPayload | null = null;
  private envelope: Envelope | null = null;
  private profile: LoginProfile | null = null;
  private preview: Preview | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  readonly ready: Promise<void>;
  private readonly registration: string;
  private readonly sessionKey: string;
  constructor(
    readonly groupId = 'default',
    private readonly releaseHost?: (host: string) => Promise<void>,
  ) {
    this.registration = groupId === 'default' ? 'login-assistant' : `login-assistant-${groupId}`;
    this.sessionKey = groupId === 'default' ? 'unlockedSession' : `group:${groupId}:session`;
    this.ready = this.initialize();
  }
  private key(name: string) {
    return this.groupId === 'default' ? name : `group:${this.groupId}:${name}`;
  }
  private async readLocal(names: string[]) {
    const data = await chrome.storage.local.get(names.map((name) => this.key(name)));
    return Object.fromEntries(names.map((name) => [name, data[this.key(name)]]));
  }
  private async saveLocal(data: Record<string, unknown>) {
    await chrome.storage.local.set(
      Object.fromEntries(Object.entries(data).map(([name, value]) => [this.key(name), value])),
    );
  }
  private async removeLocal(names: string[]) {
    await chrome.storage.local.remove(names.map((name) => this.key(name)));
  }
  private async removeHost(host: string) {
    if (this.releaseHost) await this.releaseHost(host);
    else await chrome.permissions.remove({ origins: [host] });
  }
  ownsAttempt(token?: string, tabId?: number) {
    return !!this.session?.attempts.some((a) => (token ? a.token === token : a.tabId === tabId));
  }
  authorizedHosts(): string[] {
    return this.profile ? this.hosts(this.profile) : [];
  }

  private async initialize() {
    await Promise.all([
      chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
      chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    ]);
    const [local, temporary] = await Promise.all([
      this.readLocal(['vault', 'profile', 'catalogKey']),
      chrome.storage.session.get(this.sessionKey),
    ]);
    this.envelope = (local.vault as Envelope | undefined) ?? null;
    this.profile = migrateProfile(local.profile);
    const previous = temporary[this.sessionKey] as Session | undefined;
    const key = typeof local.catalogKey === 'string' ? local.catalogKey : previous?.key;
    if (this.envelope && key) {
      this.payload = await decryptVault(this.envelope, key);
      this.session = { key, attempts: previous?.attempts ?? [], undo: previous?.undo ?? null };
      await this.saveLocal({ catalogKey: key });
      await this.persistSession();
    } else if (!this.envelope) {
      await this.createCatalog();
    }
    // An older password-protected catalog is preserved for one-time migration.
  }
  private async createCatalog() {
    const salt = randomSalt();
    const key = await deriveVaultKey(crypto.randomUUID(), salt);
    const payload = empty();
    const envelope = await encryptVault(payload, key, salt);
    await this.saveLocal({ vault: envelope, catalogKey: key });
    this.envelope = envelope;
    this.payload = payload;
    this.session = { key, attempts: [], undo: null };
    await this.persistSession();
  }
  private assert(generation = this.generation) {
    if (generation !== this.generation || !this.session || !this.payload)
      throw new Error('Catalog unavailable. Migrate the previous catalog or reset it.');
  }
  private notify() {
    void chrome.runtime.sendMessage({ type: 'STATE_CHANGED' }).catch(() => {});
  }
  private async persistSession(generation = this.generation) {
    if (!this.session) return;
    await chrome.storage.session.set({ [this.sessionKey]: this.session });
    if (generation !== this.generation) await chrome.storage.session.remove(this.sessionKey);
  }
  async invalidateSession() {
    ++this.generation;
    this.session = null;
    this.payload = null;
    this.preview = null;
    await chrome.storage.session.remove(this.sessionKey);
  }
  // Serialized callers publish one authenticated snapshot; reset can invalidate work mid-flight.
  private async write(next: VaultPayload, accountMutation = false, stillValid = () => true) {
    this.assert();
    const generation = this.generation;
    const oldEnvelope = this.envelope;
    next.snapshotRevision = this.payload!.snapshotRevision + 1;
    if (accountMutation) next.revision = this.payload!.revision + 1;
    const envelope = await encryptVault(next, this.session!.key, this.envelope!.salt);
    if (bytes(envelope) > 5 * 1024 * 1024) throw new Error('Vault size limit.');
    this.assert(generation);
    if (!stillValid()) throw new Error('Cancelled.');
    await this.saveLocal({ vault: envelope });
    if (generation !== this.generation || !this.session || !stillValid()) {
      await this.saveLocal({ vault: oldEnvelope });
      throw new Error('Cancelled.');
    }
    this.envelope = envelope;
    this.payload = next;
    this.preview = null;
    this.session.undo = null;
    if (accountMutation) this.session.attempts = [];
    await this.persistSession(generation);
    this.notify();
  }
  async handle(message: unknown, sender: chrome.runtime.MessageSender): Promise<Reply> {
    if (
      !message ||
      typeof message !== 'object' ||
      !('type' in message) ||
      typeof message.type !== 'string'
    )
      return { ok: false, error: 'Invalid request.' };
    const trusted =
      sender.id === chrome.runtime.id &&
      [chrome.runtime.getURL('popup.html'), chrome.runtime.getURL('options.html')].some(
        (url) => sender.url?.split('?')[0]?.split('#')[0] === url,
      );
    const content =
      !trusted &&
      sender.id === chrome.runtime.id &&
      isAuthorizedPageUrl(sender.url) &&
      sender.tab?.id !== undefined &&
      sender.frameId === 0 &&
      !!sender.documentId;
    if (
      trusted &&
      message.type === 'EXPORT_CSV' &&
      sender.url?.split('?')[0]?.split('#')[0] !== chrome.runtime.getURL('options.html')
    )
      return { ok: false, error: 'Export accounts from Settings.' };
    if (
      trusted &&
      message.type === 'FILL' &&
      sender.url?.split('?')[0]?.split('#')[0] !== chrome.runtime.getURL('popup.html')
    )
      return { ok: false, error: 'Open the popup on the target tab to autofill.' };
    if (
      !trusted &&
      !(content && ['CONTENT_CONTEXT', 'SUCCESS_OBSERVED', 'CANCEL_ATTEMPT'].includes(message.type))
    )
      return { ok: false, error: 'Request not authorized.' };
    if (content && message.type === 'CANCEL_ATTEMPT') {
      await this.ready;
      try {
        await this.content(message as ContentRequest, sender);
        return { ok: true, data: undefined };
      } catch {
        return { ok: false, error: 'Attempt no longer available.' };
      }
    }
    const operation = this.tail.then(async () => {
      await this.ready;
      try {
        const data = trusted
          ? await this.command(message as Command)
          : await this.content(message as ContentRequest, sender);
        return { ok: true, data } as Reply;
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error && SAFE_ERRORS.has(error.message)
              ? error.message
              : 'Operation could not complete. Check the configuration, catalog state, and permissions, then try again.',
        } as Reply;
      }
    });
    this.tail = operation;
    return operation;
  }
  private async state(command: Extract<Command, { type: 'STATE' }>): Promise<AppState> {
    const generation = this.generation;
    const accounts = this.payload?.accounts ?? [];
    const result = searchAccounts(
      accounts,
      typeof command.query === 'string' ? command.query.slice(0, 1000) : '',
      Number.isInteger(command.page) ? command.page! : 0,
    );
    const h = this.profile ? this.payload?.history[this.profile.id] : undefined;
    const summary = (a: Account) => {
      const { password: _password, ...safe } = a;
      return safe;
    };
    const byId = (id: string) => accounts.find((a) => a.accountId === id);
    const tab = await this.targetTab(command.tabId).catch(() => undefined);
    const authorized = !!(
      this.session &&
      this.profile &&
      this.payload?.catalogRules.length &&
      this.profile.approvedCatalogRuleRevision === this.payload.catalogRuleRevision &&
      tab?.url &&
      matchesAnyRule(this.payload.catalogRules, tab.url) &&
      matchesAnyOrigin(this.profile.logins, tab.url) &&
      (await chrome.permissions.contains({ origins: this.hosts(this.profile) }))
    );
    if (generation !== this.generation) return this.state(command);
    const last = h?.lastSuccessfulAccountId ? byId(h.lastSuccessfulAccountId) : undefined;
    const undo = this.session?.undo;
    return {
      initialized: !!this.envelope,
      migrationRequired: !this.session,
      profile: this.profile,
      rules: (this.payload?.catalogRules ?? []).map((r) => r.origin),
      total: accounts.length,
      matches: result.matches,
      page: result.page,
      accounts: result.accounts,
      recent: (h?.recentAccountIds ?? [])
        .map(byId)
        .filter((a): a is Account => !!a)
        .map(summary),
      lastSuccessful: last ? summary(last) : null,
      lastSuccessfulAt: last ? h!.lastSuccessfulAt : null,
      authorized,
      siteLabel: this.profile?.name ?? 'Configure a login profile',
      storageBytes: this.envelope ? bytes(this.envelope) : 0,
      undoAvailable:
        !!undo && undo.expiresAt > Date.now() && undo.revision === this.payload?.snapshotRevision,
      undoExpiresAt: undo?.expiresAt ?? null,
      version: chrome.runtime.getManifest().version,
    };
  }
  private async command(command: Command): Promise<unknown> {
    if (command.type === 'STATE') return this.state(command);
    if (command.type === 'MIGRATE') {
      if (
        this.session ||
        !this.envelope ||
        typeof command.password !== 'string' ||
        !command.password
      )
        throw new Error('No legacy catalog to migrate.');
      const key = await deriveVaultKey(command.password, this.envelope.salt);
      const payload = await decryptVault(this.envelope, key);
      await this.saveLocal({ catalogKey: key });
      this.payload = payload;
      this.session = { key, attempts: [], undo: null };
      await this.persistSession();
      this.notify();
      return;
    }
    if (command.type === 'RESET') {
      await this.invalidateSession();
      const registered = await chrome.scripting.getRegisteredContentScripts({
        ids: [this.registration],
      });
      if (registered.length)
        await chrome.scripting.unregisterContentScripts({ ids: [this.registration] });
      const oldHosts = this.authorizedHosts();
      this.profile = null;
      for (const host of oldHosts) await this.removeHost(host);
      await this.removeLocal(['vault', 'profile', 'catalogKey']);
      this.envelope = null;
      this.profile = null;
      await this.createCatalog();
      this.notify();
      return;
    }
    this.assert();
    if (command.type === 'EXPORT_CSV') return exportCsv(this.payload!.accounts);
    // User-authorized exception, same shape as EXPORT_CSV: the password is
    // returned only to satisfy an explicit copy gesture from a trusted
    // extension page, which writes it straight to the clipboard. Never
    // rendered, never logged.
    if (command.type === 'COPY_PASSWORD') {
      const account = this.payload!.accounts.find((a) => a.accountId === command.accountId);
      if (!account) throw new Error(ACCOUNT_NOT_IN_GROUP);
      return account.password;
    }
    if (command.type === 'DETECT_FIELDS') return this.detect(command.tabId);
    if (command.type === 'DETECT_TABS') return this.detectTabs();
    // Re-point an existing group at another site without re-importing its CSV.
    // Bumping the revision leaves the saved profile inert until the user
    // re-authorizes it against the new domain.
    if (command.type === 'SET_CATALOG_RULE') {
      const rules = parseDomainRules(command.rule);
      const current = this.payload!.catalogRules.map((r) => r.origin)
        .sort()
        .join(' ');
      if (
        current ===
        rules
          .map((r) => r.origin)
          .sort()
          .join(' ')
      )
        throw new Error(RULE_UNCHANGED);
      const next = structuredClone(this.payload!);
      next.catalogRules = rules;
      next.catalogRuleRevision = this.payload!.catalogRuleRevision + 1;
      await this.write(next);
      this.notify();
      return;
    }
    if (command.type === 'PREVIEW_IMPORT') {
      if (
        !Array.isArray(command.bytes) ||
        command.bytes.length > 2 * 1024 * 1024 ||
        command.bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255) ||
        !['merge', 'replace'].includes(command.mode) ||
        typeof command.rule !== 'string'
      )
        throw new Error();
      const parsed = parseCsv(new Uint8Array(command.bytes));
      const rules = parseDomainRules(command.rule);
      const planned = planImport(this.payload!, parsed, rules, command.mode);
      const preview: ImportPreview = {
        ...planned.counts,
        token: crypto.randomUUID(),
        found: parsed.found,
        valid: parsed.valid,
        invalid: parsed.invalid,
        diagnostics: parsed.diagnostics,
        rule: rules.map(formatRule).join(', '),
        mode: command.mode,
      };
      this.preview = {
        public: preview,
        payload: planned.payload,
        revision: this.payload!.snapshotRevision,
      };
      return preview;
    }
    if (command.type === 'COMMIT_IMPORT') {
      if (
        !this.preview ||
        this.preview.public.token !== command.token ||
        this.preview.revision !== this.payload!.snapshotRevision
      )
        throw new Error();
      await this.write(structuredClone(this.preview.payload), true);
      return;
    }
    if (command.type === 'DELETE') {
      const account = this.payload!.accounts.find((a) => a.accountId === command.accountId);
      if (!account) throw new Error();
      const generation = this.generation;
      const sealed = await sealValue(account, this.session!.key, 'deleted-account');
      this.assert(generation);
      const next = structuredClone(this.payload!);
      next.accounts = next.accounts.filter((a) => a.accountId !== account.accountId);
      this.prune(next);
      await this.write(next, true);
      this.session!.undo = {
        sealed,
        expiresAt: Date.now() + 30_000,
        revision: next.snapshotRevision,
        rule: next.catalogRules.map(formatRule).join(' ') || null,
      };
      await this.persistSession();
      this.notify();
      return;
    }
    if (command.type === 'UNDO') {
      const undo = this.session!.undo;
      if (
        !undo ||
        undo.expiresAt <= Date.now() ||
        undo.revision !== this.payload!.snapshotRevision ||
        undo.rule !== (this.payload!.catalogRules.map(formatRule).join(' ') || null)
      )
        throw new Error();
      const generation = this.generation;
      const account = await unsealValue<Account>(undo.sealed, this.session!.key, 'deleted-account');
      this.assert(generation);
      if (this.payload!.accounts.some((a) => a.accountId === account.accountId)) throw new Error();
      const next = structuredClone(this.payload!);
      next.accounts.push(account);
      await this.write(next, true);
      return;
    }
    if (command.type === 'PURGE') {
      const next = structuredClone(this.payload!);
      next.accounts = [];
      next.history = {};
      await this.write(next, true);
      return;
    }
    if (command.type === 'SAVE_PROFILE') {
      try {
        await this.saveProfile(command.profile);
      } catch (error) {
        // A user-gesture permission request happens in the UI before validation here.
        // Keep only the existing profile's grant when that save cannot complete.
        try {
          const url = new URL(command.profile.loginUrl);
          const candidate = `${url.protocol}//${url.hostname}/*`;
          if (!this.authorizedHosts().includes(candidate)) await this.removeHost(candidate);
        } catch {
          /* Invalid profile input has no usable host grant. */
        }
        const registrations = await chrome.scripting.getRegisteredContentScripts({
          ids: [this.registration],
        });
        if (registrations.length)
          await chrome.scripting.unregisterContentScripts({ ids: [this.registration] });
        if (
          this.profile &&
          (await chrome.permissions.contains({ origins: this.hosts(this.profile) }))
        )
          await chrome.scripting.registerContentScripts([
            {
              id: this.registration,
              matches: this.hosts(this.profile),
              js: ['content.js'],
              allFrames: false,
              runAt: 'document_idle',
              persistAcrossSessions: true,
              world: 'ISOLATED',
            },
          ]);
        throw error;
      }
      return;
    }
    if (command.type === 'FILL') {
      await this.fill(command.accountId, command.tabId);
      return;
    }
    throw new Error();
  }
  private prune(payload: VaultPayload) {
    const ids = new Set(payload.accounts.map((a) => a.accountId));
    for (const h of Object.values(payload.history)) {
      h.recentAccountIds = h.recentAccountIds.filter((id) => ids.has(id));
      if (h.lastSuccessfulAccountId && !ids.has(h.lastSuccessfulAccountId)) {
        h.lastSuccessfulAccountId = null;
        h.lastSuccessfulAt = null;
      }
    }
  }
  /** One host pattern per authorized environment. */
  private hosts(profile: LoginProfile) {
    return profile.logins.map(
      (l) => `${new URL(l.origin).protocol}//${new URL(l.origin).hostname}/*`,
    );
  }
  private async saveProfile(input: Extract<Command, { type: 'SAVE_PROFILE' }>['profile']) {
    if (!this.payload!.catalogRules.length) throw new Error();
    const next = validateProfile(
      input,
      this.payload!.catalogRules,
      this.payload!.catalogRuleRevision,
      this.profile ?? undefined,
    );
    if (!(await chrome.permissions.contains({ origins: this.hosts(next) }))) throw new Error();
    const generation = this.generation;
    const previous = this.profile;
    this.session!.attempts = [];
    this.session!.undo = null;
    this.preview = null;
    await this.persistSession();
    const registrations = await chrome.scripting.getRegisteredContentScripts({
      ids: [this.registration],
    });
    if (registrations.length)
      await chrome.scripting.unregisterContentScripts({ ids: [this.registration] });
    await chrome.scripting.registerContentScripts([
      {
        id: this.registration,
        matches: this.hosts(next),
        js: ['content.js'],
        allFrames: false,
        runAt: 'document_idle',
        persistAcrossSessions: true,
        world: 'ISOLATED',
      },
    ]);
    this.assert(generation);
    await this.saveLocal({ profile: next });
    this.assert(generation);
    this.profile = next;
    if (previous)
      for (const host of this.hosts(previous))
        if (!this.hosts(next).includes(host)) await this.removeHost(host);
    this.notify();
  }
  private async targetTab(id?: number) {
    if (id !== undefined && (!Number.isInteger(id) || id < 0)) throw new Error();
    const tab =
      id === undefined
        ? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
        : await chrome.tabs.get(id);
    if (!tab || tab.id === undefined) throw new Error();
    return tab;
  }
  private async probe(tabId: number) {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: () => location.href,
    });
    const top = results.find((r) => r.frameId === 0);
    if (!top?.documentId || typeof top.result !== 'string') throw new Error();
    return { documentId: top.documentId, url: top.result };
  }
  /**
   * Lists the recently used tabs already on the approved catalog domain so the
   * user picks which page detection reads instead of the worker guessing. Tab
   * titles and URLs are only readable where the user granted that host.
   */
  private async detectTabs(): Promise<DetectTab[]> {
    const rules = this.payload!.catalogRules;
    if (!rules.length) throw new Error(DETECT_OFF_DOMAIN);
    const open = await chrome.tabs.query({});
    return open
      .filter((t) => t.id !== undefined && t.url && matchesAnyRule(rules, t.url))
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
      .slice(0, 3)
      .map((t) => ({ id: t.id!, title: t.title?.trim() || t.url!, url: t.url! }));
  }
  /**
   * Reports identifying attributes of the login inputs on the chosen tab so the
   * user can configure matching without DevTools. Scoped to the imported
   * catalog domain; never reads or returns input values.
   */
  private async detect(tabId?: number): Promise<DetectResult> {
    const rules = this.payload!.catalogRules;
    if (!rules.length) throw new Error(DETECT_OFF_DOMAIN);
    // Settings runs in its own tab, so the active tab is Settings itself. Look
    // for any open tab already on the approved catalog domain instead.
    const open = await chrome.tabs.query({});
    const candidates = open.filter(
      (t) => t.id !== undefined && t.url && matchesAnyRule(rules, t.url),
    );
    const tab =
      candidates.find((t) => t.id === tabId) ?? candidates.find((t) => t.active) ?? candidates[0];
    if (!tab) throw new Error(DETECT_NO_TAB);
    const current = await this.probe(tab.id!);
    if (!matchesAnyRule(rules, current.url)) throw new Error(DETECT_OFF_DOMAIN);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id!, documentIds: [current.documentId] },
      func: () => {
        // Component-based login pages put their inputs in open shadow roots,
        // which a plain document query cannot see.
        const collect = (root: DocumentFragment | Document, found: HTMLInputElement[]) => {
          for (const node of root.querySelectorAll('*')) {
            if (node instanceof HTMLInputElement) found.push(node);
            if (node.shadowRoot) collect(node.shadowRoot, found);
          }
          return found;
        };
        const inputs = collect(document, [])
          .filter(
            (input) =>
              ['text', 'email', 'password'].includes(input.type) &&
              !input.disabled &&
              !input.readOnly &&
              input.getClientRects().length > 0,
          )
          .slice(0, 50)
          .map((input) => ({
            password: input.type === 'password',
            id: input.id || '',
            name: input.name || '',
            autocomplete: input.getAttribute('autocomplete') || '',
            placeholder: input.placeholder || '',
            ariaLabel: input.getAttribute('aria-label') || '',
            label: [...(input.labels ?? [])]
              .map((node) => node.textContent || '')
              .join(' ')
              .trim()
              .replace(/\s+/gu, ' ')
              .slice(0, 100),
          }));
        // Named so the user learns why an apparently normal page reads empty.
        const frames = [
          ...new Set(
            [...document.querySelectorAll('iframe')]
              .filter((frame) => frame.getClientRects().length > 0)
              .map((frame) => {
                try {
                  return new URL(frame.src || 'about:blank', location.href).hostname;
                } catch {
                  return '';
                }
              })
              .filter(Boolean),
          ),
        ].slice(0, 5);
        return { inputs, frames };
      },
    });
    const top = results.find((r) => r.frameId === 0);
    const result = top?.result as DetectResult | undefined;
    return { inputs: result?.inputs ?? [], frames: result?.frames ?? [] };
  }
  // @spec R-6.1..R-6.8: explicit account delivery is bound to a current top-frame document.
  private async fill(accountId: string, tabId?: number) {
    const generation = this.generation;
    const authorization = this.authorizationRevision;
    const profile = this.profile;
    const rules = this.payload!.catalogRules;
    const account = this.payload!.accounts.find((a) => a.accountId === accountId);
    if (!account) throw new Error(ACCOUNT_NOT_IN_GROUP);
    if (!profile || !rules.length) throw new Error(FILL_NO_PROFILE);
    if (profile.approvedCatalogRuleRevision !== this.payload!.catalogRuleRevision)
      throw new Error(FILL_STALE_PROFILE);
    if (!(await chrome.permissions.contains({ origins: this.hosts(profile) })))
      throw new Error(FILL_NO_PERMISSION);
    const tab = await this.targetTab(tabId);
    if (!tab.active) throw new Error(FILL_TAB_INACTIVE);
    const current = await this.probe(tab.id!);
    if (!matchesAnyRule(rules, current.url)) throw new Error(FILL_OFF_CATALOG);
    if (!matchesAnyOrigin(profile.logins, current.url)) throw new Error(FILL_OFF_PROFILE);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id!, documentIds: [current.documentId] },
      files: ['content.js'],
    });
    const options = { documentId: current.documentId };
    const inspection = (await chrome.tabs.sendMessage(
      tab.id!,
      { type: 'INSPECT', profile },
      options,
    )) as FillResult;
    // The reason is restated here rather than echoed from the content script,
    // which runs in a page the user does not control.
    if (!inspection?.ok) throw new Error(FILL_NO_FIELDS);
    if (inspection.baseline) throw new Error(FILL_ALREADY_SUCCESS);
    this.assert(generation);
    const attempt: Attempt = {
      token: crypto.randomUUID(),
      tabId: tab.id!,
      documentId: current.documentId,
      profileId: profile.id,
      profileRevision: profile.revision,
      catalogRevision: this.payload!.revision,
      accountId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 120_000,
      acknowledged: false,
    };
    this.session!.attempts = [...this.session!.attempts.filter((a) => a.tabId !== tab.id), attempt];
    await this.persistSession();
    this.assert(generation);
    if (
      authorization !== this.authorizationRevision ||
      !(await chrome.permissions.contains({ origins: this.hosts(profile) }))
    ) {
      await this.cancelTab(tab.id!);
      throw new Error();
    }
    this.assert(generation);
    if (authorization !== this.authorizationRevision) throw new Error();
    let filled: FillResult;
    try {
      filled = (await chrome.tabs.sendMessage(
        tab.id!,
        {
          type: 'FILL_FIELDS',
          profile,
          username: account.username,
          password: account.password,
          attempt,
        },
        options,
      )) as FillResult;
    } catch {
      await this.cancelTab(tab.id!);
      throw new Error();
    }
    if (!filled?.ok) {
      await this.cancelTab(tab.id!);
      throw new Error();
    }
    this.assert(generation);
    const live = this.session!.attempts.find((a) => a.token === attempt.token);
    if (!live) throw new Error();
    live.acknowledged = true;
    await this.persistSession();
    this.assert(generation);
    const next = structuredClone(this.payload!);
    const h = (next.history[profile.id] ??= history());
    h.recentAccountIds = [accountId, ...h.recentAccountIds.filter((id) => id !== accountId)].slice(
      0,
      RECENT_LIMIT,
    );
    await this.write(next);
  }
  // Observation is independently revalidated; a content sender never selects credentials.
  private async content(
    command: ContentRequest,
    sender: chrome.runtime.MessageSender,
  ): Promise<ContentContext | void> {
    if (!this.session || !this.payload || !this.profile) return { profile: null, attempt: null };
    this.assert();
    const generation = this.generation;
    const profile = this.profile;
    if (!(await chrome.permissions.contains({ origins: this.hosts(profile) })))
      return { profile: null, attempt: null };
    const tabId = sender.tab!.id!;
    const current = await this.probe(tabId);
    this.assert(generation);
    if (current.documentId !== sender.documentId) throw new Error();
    let attempt = this.session!.attempts.find((a) => a.tabId === tabId);
    const success = profile.success;
    const routeAllowed =
      matchesAnyOrigin(profile.logins, current.url) ||
      !!(success && matchesRoute(success.route, current.url));
    if (
      attempt &&
      (!routeAllowed ||
        attempt.expiresAt <= Date.now() ||
        attempt.profileRevision !== profile.revision ||
        attempt.catalogRevision !== this.payload.revision)
    ) {
      await this.cancelTab(tabId);
      attempt = undefined;
    }
    if (command.type === 'CONTENT_CONTEXT')
      return { profile: routeAllowed ? profile : null, attempt: attempt ?? null };
    if (!attempt || command.token !== attempt.token) throw new Error();
    if (command.type === 'CANCEL_ATTEMPT') {
      await this.cancelTab(tabId);
      return;
    }
    // Without a configured condition there is nothing to observe, so a success
    // report can never be attributed.
    if (!success || !attempt.acknowledged || !matchesRoute(success.route, current.url))
      throw new Error();
    if (success.kind === 'element') {
      const results = await chrome.scripting.executeScript({
        target: { tabId, documentIds: [current.documentId] },
        func: (selector: string) => {
          return [...document.querySelectorAll(selector)].some((element) => {
            if (!element.isConnected || !element.getClientRects().length) return false;
            for (let node: Element | null = element; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (
                node.hasAttribute('hidden') ||
                node.hasAttribute('inert') ||
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.visibility === 'collapse' ||
                style.opacity === '0'
              )
                return false;
            }
            return true;
          });
        },
        args: [success.selector],
      });
      if (results[0]?.result !== true) throw new Error();
    }
    this.assert(generation);
    const final = await this.probe(tabId);
    if (final.documentId !== current.documentId || !matchesRoute(success.route, final.url))
      throw new Error();
    this.assert(generation);
    if (
      !this.session!.attempts.some((a) => a.token === attempt!.token) ||
      attempt.expiresAt <= Date.now() ||
      !this.payload.accounts.some((a) => a.accountId === attempt!.accountId)
    )
      throw new Error();
    const next = structuredClone(this.payload);
    const h = (next.history[profile.id] ??= history());
    h.lastSuccessfulAccountId = attempt.accountId;
    h.lastSuccessfulAt = Date.now();
    await this.write(
      next,
      false,
      () =>
        !!this.session?.attempts.some(
          (a) => a.token === attempt!.token && a.expiresAt > Date.now(),
        ),
    );
    await this.cancelTab(tabId);
  }
  async cancelTab(tabId: number) {
    if (this.session) {
      this.session.attempts = this.session.attempts.filter((a) => a.tabId !== tabId);
      await this.persistSession();
    }
  }
  async navigation(tabId: number, url: string) {
    await this.ready;
    if (
      this.profile &&
      !matchesAnyOrigin(this.profile.logins, url) &&
      !(this.profile.success && matchesRoute(this.profile.success.route, url))
    )
      await this.cancelTab(tabId);
  }
  async permissionRemoved() {
    ++this.authorizationRevision;
    await this.ready;
    if (this.session) {
      this.session.attempts = [];
      this.session.undo = null;
      await this.persistSession();
      this.notify();
    }
  }
}
