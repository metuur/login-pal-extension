import { AssistantService } from './service';
import { isAuthorizedPageUrl } from '../domain/rules';
import type { AccountSummary, AppState, Command, CsvGroup, Reply } from '../shared/types';
import { searchAccountsAcrossGroups } from '../domain/search';
import type { CurrentPage } from './service';

/** Each imported CSV group has an independent catalog, profile, history and write queue. */
export class GroupService {
  private groups: CsvGroup[] = [];
  private services = new Map<string, AssistantService>();
  private writes: Promise<unknown> = Promise.resolve();
  private fills: Promise<unknown> = Promise.resolve();
  private readonly choices = new Map<number, CurrentPage & { groupId: string }>();
  readonly ready = this.initialize();

  private async initialize() {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const data = await chrome.storage.local.get('csvGroups');
    this.groups = (data.csvGroups as CsvGroup[] | undefined) ?? [
      { id: 'default', name: 'Imported accounts' },
    ];
    if (!data.csvGroups) await chrome.storage.local.set({ csvGroups: this.groups });
    for (const group of this.groups) this.services.set(group.id, this.create(group.id));
    await Promise.all([...this.services.values()].map((service) => service.ready));
  }
  private create(id: string) {
    return new AssistantService(id, async (host) => {
      if (![...this.services.values()].some((service) => service.authorizedHosts().includes(host)))
        await chrome.permissions.remove({ origins: [host] });
    });
  }
  private trusted(sender: chrome.runtime.MessageSender) {
    return (
      sender.id === chrome.runtime.id &&
      ['popup.html', 'options.html'].some(
        (page) => sender.url?.split('?')[0]?.split('#')[0] === chrome.runtime.getURL(page),
      )
    );
  }
  private async pageIdentities(page: CurrentPage | null) {
    if (!page) return [];
    return Promise.all(
      this.groups.map(async (group) => ({
        group,
        identity: await this.services.get(group.id)!.titleIdentity(page.url, page.title),
      })),
    );
  }
  private async resolvePage(
    page: CurrentPage | null,
    identities?: Awaited<ReturnType<GroupService['pageIdentities']>>,
  ) {
    if (!page)
      return {
        status: 'unavailable' as const,
        title: null,
        groupId: null,
        groupName: null,
        rule: null,
        matched: false,
        selected: false,
      };
    const pageGroups = identities ?? (await this.pageIdentities(page));
    const matches = pageGroups.filter((candidate) => candidate.identity?.matched);
    const unique = matches.length === 1 ? matches[0] : undefined;
    let choice = this.choices.get(page.tabId);
    if (choice && choice.documentId !== page.documentId) {
      this.choices.delete(page.tabId);
      choice = undefined;
    }
    if (
      choice &&
      (choice.url !== page.url || choice.title !== page.title) &&
      unique?.group.id !== choice.groupId
    ) {
      this.choices.delete(page.tabId);
      choice = undefined;
    }
    if (choice && unique && unique.group.id !== choice.groupId) {
      this.choices.delete(page.tabId);
      choice = undefined;
    }
    if (choice && (choice.url !== page.url || choice.title !== page.title)) {
      choice = { ...page, groupId: choice.groupId };
      this.choices.set(page.tabId, choice);
    }
    const selected =
      unique ?? pageGroups.find((candidate) => candidate.group.id === choice?.groupId);
    const selectedId = selected?.group.id ?? null;
    const selectedIdentity = selected?.identity ?? null;
    return {
      status: !page.title
        ? ('unavailable' as const)
        : unique
          ? ('matched' as const)
          : ('choice-required' as const),
      title: page.title,
      groupId: selectedId,
      groupName: selected?.group.name ?? null,
      rule: selectedIdentity?.rule ?? null,
      matched: !!unique && !!selectedIdentity?.matched,
      selected: !!selected,
    };
  }
  private async chooseGroup(groupId: string, tabId: number): Promise<Reply> {
    const service = this.services.get(groupId);
    if (!service || !Number.isInteger(tabId) || tabId < 0)
      return { ok: false, error: 'Choose an existing CSV group and current tab.' };
    try {
      const page = await service.currentPage(tabId);
      if (!(await service.titleIdentity(page.url, page.title)))
        return {
          ok: false,
          error: 'That group is not authorized for this page. Choose a matching group.',
        };
      const matches = await this.pageIdentities(page);
      const unique = matches.filter((candidate) => candidate.identity?.matched);
      if (unique.length === 1 && unique[0]!.group.id !== groupId)
        return {
          ok: false,
          error: 'This page uniquely matches another application. Refresh and choose that group.',
        };
      this.choices.set(tabId, { ...page, groupId });
      void chrome.runtime.sendMessage({ type: 'STATE_CHANGED' }).catch(() => {});
      return { ok: true, data: undefined };
    } catch {
      return {
        ok: false,
        error: 'This page cannot be read. Open an authorized page and try again.',
      };
    }
  }
  private async state(
    command: Extract<Command, { type: 'STATE' }>,
    sender: chrome.runtime.MessageSender,
    requestedId: string,
  ): Promise<Reply> {
    const tabId = command.tabId;
    const initial = await this.services.get(requestedId)!.handle(command, sender);
    if (!initial.ok) return initial;
    const base = initial.data as AppState;
    let page: CurrentPage | null = null;
    try {
      page = await this.services.get(requestedId)!.currentPage(tabId);
    } catch {
      // The selected tab may be a browser-internal page or have no read access.
    }
    const pageIdentities = await this.pageIdentities(page);
    const identity = await this.resolvePage(page, pageIdentities);
    const matchId = identity.matched ? identity.groupId : null;
    const pageGroupId = matchId ?? (identity.selected ? identity.groupId : null);
    const popup = sender.url === chrome.runtime.getURL('popup.html');
    const query = typeof command.query === 'string' ? command.query.trim() : '';
    let state = base;
    if (pageGroupId && pageGroupId !== requestedId && !query) {
      const switched = await this.services.get(pageGroupId)!.handle(command, sender);
      if (switched.ok) state = switched.data as AppState;
    }
    state.groups = this.groups;
    state.groupId = pageGroupId ?? requestedId;
    state.groupName = this.groups.find((group) => group.id === state.groupId)?.name;
    state.applicationIdentity = identity;
    if (query) {
      const records = (
        await Promise.all(
          this.groups.map((group) => this.services.get(group.id)!.searchableAccounts(group.name)),
        )
      ).flatMap((groupRecords) => groupRecords ?? []);
      const result = searchAccountsAcrossGroups(records, query.slice(0, 1000), command.page ?? 0);
      const identityByGroup = new Map(
        pageIdentities.map(({ group, identity: ruleContext }) => [group.id, ruleContext]),
      );
      const withIdentity: AccountSummary[] = result.accounts.map((account) => {
        const ruleContext = identityByGroup.get(account.groupId!);
        return {
          ...account,
          applicationIdentity: {
            status:
              !page || !page.title
                ? 'unavailable'
                : ruleContext?.matched
                  ? 'matched'
                  : 'choice-required',
            title: page?.title ?? null,
            rule: ruleContext?.rule ?? null,
            matched: ruleContext?.matched ?? false,
            selected: identity.selected && identity.groupId === account.groupId,
          },
        };
      });
      state.accounts = withIdentity;
      state.matches = result.matches;
      state.total = result.total;
      state.page = result.page;
    } else if (popup && !identity.selected) {
      state.accounts = [];
      state.recent = [];
      state.lastSuccessful = null;
      state.lastSuccessfulAt = null;
      state.matches = 0;
      state.authorized = false;
    }
    return { ok: true, data: state };
  }
  async handle(message: unknown, sender: chrome.runtime.MessageSender): Promise<Reply> {
    await this.ready;
    if (!message || typeof message !== 'object' || !('type' in message))
      return { ok: false, error: 'Invalid request.' };
    const input = message as {
      type: string;
      groupId?: string;
      name?: string;
      token?: string;
      tabId?: number;
      fromSearch?: boolean;
    };
    if (!this.trusted(sender)) {
      if (
        sender.id !== chrome.runtime.id ||
        !isAuthorizedPageUrl(sender.url) ||
        sender.frameId !== 0 ||
        !sender.documentId ||
        sender.tab?.id === undefined
      )
        return { ok: false, error: 'Request not authorized.' };
      if (!['CONTENT_CONTEXT', 'SUCCESS_OBSERVED', 'CANCEL_ATTEMPT'].includes(input.type))
        return { ok: false, error: 'Request not authorized.' };
      const service = [...this.services.values()].find((candidate) =>
        candidate.ownsAttempt(input.token, sender.tab!.id),
      );
      // A content page cannot choose a group or enumerate profiles. Only a live
      // fill attempt authorizes tracking, including after full-page navigation.
      return service
        ? service.handle(message, sender)
        : { ok: true, data: { profile: null, attempt: null } };
    }
    const id = input.groupId ?? 'default';
    const service = this.services.get(id);
    if (!service) return { ok: false, error: 'Choose an existing CSV group.' };
    if (input.type === 'CHOOSE_GROUP') return this.chooseGroup(id, input.tabId as number);
    if (input.type === 'STATE')
      return this.state(message as Extract<Command, { type: 'STATE' }>, sender, id);
    if (input.type === 'CREATE_GROUP' || input.type === 'RENAME_GROUP') {
      const operation = this.writes.then(async (): Promise<Reply> => {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 80)
          return { ok: false, error: 'Enter a group name of 1–80 characters.' };
        if (
          this.groups.some(
            (g) =>
              g.name.toLowerCase() === name.toLowerCase() &&
              (input.type === 'CREATE_GROUP' || g.id !== id),
          )
        )
          return { ok: false, error: 'A group with that name already exists.' };
        if (input.type === 'CREATE_GROUP' && this.groups.length >= 50)
          return { ok: false, error: 'The limit is 50 CSV groups.' };
        const group = { id: input.type === 'CREATE_GROUP' ? crypto.randomUUID() : id, name };
        const next =
          input.type === 'CREATE_GROUP'
            ? [...this.groups, group]
            : this.groups.map((g) => (g.id === id ? group : g));
        try {
          await chrome.storage.local.set({ csvGroups: next });
          this.groups = next;
          if (!this.services.has(group.id)) {
            const created = this.create(group.id);
            this.services.set(group.id, created);
            await created.ready;
          }
          void chrome.runtime.sendMessage({ type: 'STATE_CHANGED' }).catch(() => {});
          return { ok: true, data: group };
        } catch {
          return { ok: false, error: 'Could not save the CSV group.' };
        }
      });
      this.writes = operation;
      return operation;
    }
    if (input.type === 'FILL') {
      const operation: Promise<Reply> = this.fills.then(async (): Promise<Reply> => {
        // One attributable attempt per tab, even across different CSV groups.
        const tabId =
          input.tabId ??
          (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
        let page: CurrentPage;
        try {
          page = await service.currentPage(tabId);
        } catch {
          return {
            ok: false,
            error: 'This page cannot be read. Choose an authorized application first.',
          };
        }
        const identity = await this.resolvePage(page, await this.pageIdentities(page));
        const preflightError = await service.fillContextError(page.url);
        if (
          (identity.matched && identity.groupId !== id) ||
          (identity.selected && identity.groupId !== id) ||
          (!identity.matched && !identity.selected && !input.fromSearch && !preflightError)
        )
          return {
            ok: false,
            error: 'Choose this application for the current tab before filling an account.',
          };
        if (tabId !== undefined)
          await Promise.all(
            [...this.services.values()].filter((s) => s !== service).map((s) => s.cancelTab(tabId)),
          );
        return service.handle({ ...message, expectedPage: page }, sender);
      });
      this.fills = operation.catch(() => {});
      return operation;
    }
    const result = await service.handle(message, sender);
    if (result.ok && input.type === 'STATE')
      return {
        ok: true,
        data: {
          ...(result.data as AppState),
          groups: this.groups,
          groupId: id,
          groupName: this.groups.find((g) => g.id === id)!.name,
        },
      };
    return result;
  }
  async cancelTab(id: number) {
    await this.ready;
    this.choices.delete(id);
    await Promise.all([...this.services.values()].map((s) => s.cancelTab(id)));
  }
  async navigation(id: number, url: string) {
    await this.ready;
    await Promise.all([...this.services.values()].map((s) => s.navigation(id, url)));
  }
  async pageChanged() {
    await this.ready;
    void chrome.runtime.sendMessage({ type: 'STATE_CHANGED' }).catch(() => {});
  }
  async permissionRemoved() {
    await this.ready;
    await Promise.all([...this.services.values()].map((s) => s.permissionRemoved()));
  }
}
