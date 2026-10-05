import { AssistantService } from './service';
import { isAuthorizedPageUrl } from '../domain/rules';
import type { AppState, CsvGroup, Reply } from '../shared/types';

/** Each imported CSV group has an independent catalog, profile, history and write queue. */
export class GroupService {
  private groups: CsvGroup[] = [];
  private services = new Map<string, AssistantService>();
  private writes: Promise<unknown> = Promise.resolve();
  private fills: Promise<unknown> = Promise.resolve();
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
      if (![...this.services.values()].some((service) => service.authorizedHost() === host))
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
  async handle(message: unknown, sender: chrome.runtime.MessageSender): Promise<Reply> {
    await this.ready;
    if (!message || typeof message !== 'object' || !('type' in message))
      return { ok: false, error: 'Invalid request.' };
    const input = message as { type: string; groupId?: string; name?: string; token?: string };
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
      const operation = this.fills.then(async () => {
        // One attributable attempt per tab, even across different CSV groups.
        const tabId =
          (message as { tabId?: number }).tabId ??
          (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
        if (tabId !== undefined)
          await Promise.all(
            [...this.services.values()].filter((s) => s !== service).map((s) => s.cancelTab(tabId)),
          );
        return service.handle(message, sender);
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
    await Promise.all([...this.services.values()].map((s) => s.cancelTab(id)));
  }
  async navigation(id: number, url: string) {
    await this.ready;
    await Promise.all([...this.services.values()].map((s) => s.navigation(id, url)));
  }
  async permissionRemoved() {
    await this.ready;
    await Promise.all([...this.services.values()].map((s) => s.permissionRemoved()));
  }
}
