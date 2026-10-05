import type { AccountSummary, AppState, Command, Reply } from '../shared/types';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(
  text: string,
  action: () => unknown,
  className = 'secondary',
): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', () => {
    void action();
  });
  return b;
}
export function icon(
  name: 'key' | 'settings' | 'external' | 'back' | 'trash' | 'search' | 'upload' | 'shield',
): SVGSVGElement {
  const paths = {
    key: 'M8 14a4 4 0 1 1 3.5-6H21v4h-3v3h-3v-3h-3.5A4 4 0 0 1 8 14Z',
    settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3-1 2 3-2 3 2 3-2 3-3-1-1 3h-4l-1-3-3 1-2-3 2-3-2-3 2-3 3 1Z',
    external: 'M14 3h7v7M21 3 10 14M10 3H4v17h16v-6',
    back: 'm14 5-7 7 7 7M7 12h13',
    trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
    search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 6 6',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7',
    shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 9 3 3 5-5',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(svg.namespaceURI, 'path');
  p.setAttribute('d', paths[name]);
  svg.append(p);
  return svg;
}
export function iconButton(name: Parameters<typeof icon>[0], label: string, action: () => unknown) {
  const b = button('', action, 'icon-button');
  b.setAttribute('aria-label', label);
  b.title = label;
  b.append(icon(name));
  return b;
}
export async function request<T = void>(command: Command): Promise<T> {
  let reply: Reply<T>;
  try {
    reply = (await chrome.runtime.sendMessage(command)) as Reply<T>;
  } catch {
    throw new Error('The extension is unavailable. Reopen it and try again.');
  }
  if (!reply?.ok)
    throw new Error(
      reply && !reply.ok ? reply.error : 'The extension could not complete that action.',
    );
  return reply.data;
}
export function installActivityTracking(isUnlocked: () => boolean): () => void {
  let lastTouch = Number.NEGATIVE_INFINITY;
  let disposed = false;
  const onInteraction = (event: Event) => {
    if (disposed || !event.isTrusted || !isUnlocked()) return;
    const now = Date.now();
    if (now - lastTouch < 500) return;
    lastTouch = now;
    // Only an actual interaction can renew inactivity; rendering and timers cannot.
    void request({ type: 'TOUCH' }).catch(() => {
      // A lock racing with the gesture remains authoritative in the worker.
    });
  };
  const events = ['pointerdown', 'keydown', 'input'] as const;
  for (const event of events) document.addEventListener(event, onInteraction, true);
  return () => {
    disposed = true;
    for (const event of events) document.removeEventListener(event, onInteraction, true);
  };
}
export function message(target: HTMLElement, text: string, error = false) {
  target.textContent = text;
  target.className = `notice ${error ? 'error' : 'info'}`;
  target.hidden = !text;
}
export function liveRegion() {
  const n = el('div', 'notice');
  n.setAttribute('role', 'status');
  n.setAttribute('aria-live', 'polite');
  n.hidden = true;
  return n;
}
export function field(label: string, type = 'text', value = '') {
  const wrap = el('label', 'field');
  const input = el('input');
  input.type = type;
  input.value = value;
  wrap.append(el('span', 'field-label', label), input);
  return { wrap, input };
}
export function title(account: AccountSummary) {
  return account.metadata.customer_name || account.accountId;
}
export function featuredHeading(account: AccountSummary) {
  const heading = el('div', 'featured-heading');
  heading.append(el('strong', 'featured-title', title(account)));
  const accountType = account.metadata.account_type || account.metadata.plan;
  if (accountType) heading.append(el('span', 'badge featured-badge', accountType));
  const environment = account.metadata.environment || account.metadata.env;
  if (environment)
    heading.append(el('span', 'badge featured-badge environment-badge', environment));
  return heading;
}
export function metadata(account: AccountSummary) {
  const details = el('details', 'metadata');
  details.append(el('summary', '', 'Account details'));
  const dl = el('dl');
  for (const [key, value] of Object.entries({
    account_id: account.accountId,
    username: account.username,
    ...account.metadata,
  })) {
    dl.append(el('dt', '', key), el('dd', '', value));
  }
  details.append(dl);
  return details;
}
export function accountRow(
  account: AccountSummary,
  action: () => unknown,
  management = false,
  origin = '',
) {
  const row = el('article', 'account-row');
  const avatar = el(
    'div',
    'avatar',
    title(account)
      .split(/\s+/)
      .map((x) => x[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  );
  const content = el('div', 'account-content');
  const heading = el('div', 'account-heading');
  const name = el('strong', 'truncate', title(account));
  name.title = title(account);
  heading.append(name);
  const badge = account.metadata.account_type || account.metadata.role || account.metadata.plan;
  if (badge) {
    const n = el('span', 'badge truncate', badge);
    n.title = badge;
    heading.append(n);
  }
  const sub = el('p', 'mono subtle truncate', `${account.accountId} · ${account.username}`);
  sub.title = `${account.accountId} · ${account.username}`;
  content.append(heading, sub);
  if (management && origin) content.append(el('p', 'scope mono truncate', origin));
  content.append(metadata(account));
  const act = management
    ? iconButton('trash', `Delete ${account.accountId}`, action)
    : button('Select ↗', action, 'select-button');
  row.append(avatar, content, act);
  return row;
}
export function sectionLabel(text: string, count?: number) {
  const n = el('div', 'section-label');
  n.append(el('span', '', text));
  if (count !== undefined) n.append(el('span', 'count', String(count)));
  return n;
}
export function searchBox(onChange: (value: string) => void) {
  const wrap = el('div', 'search-box');
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Search email, role, company or ID…';
  input.setAttribute('aria-label', 'Search accounts');
  wrap.append(icon('search'), input);
  input.addEventListener('input', () => onChange(input.value));
  return { wrap, input };
}
export function pagination(state: AppState, onPage: (page: number) => void) {
  const n = el('nav', 'pagination');
  n.setAttribute('aria-label', 'Account pages');
  const previous = button('← Previous', () => onPage(state.page - 1));
  previous.disabled = state.page === 0;
  const next = button('Next →', () => onPage(state.page + 1));
  next.disabled = (state.page + 1) * 50 >= state.matches;
  n.append(
    previous,
    el('span', 'subtle', `Page ${state.page + 1} of ${Math.max(1, Math.ceil(state.matches / 50))}`),
    next,
  );
  return n;
}
export function vaultForm(state: AppState, onDone: () => Promise<void>) {
  const form = el('form', 'vault-form panel');
  form.append(
    el('div', 'lock-emblem', '◇'),
    el('h1', '', state.initialized ? 'Unlock your accounts' : 'Your accounts, on this device'),
    el(
      'p',
      'subtle',
      state.initialized
        ? 'Enter your master password to access your local vault.'
        : 'Create a master password to encrypt your account vault. Use at least 12 characters.',
    ),
  );
  const password = field('Master password', 'password');
  password.input.autocomplete = state.initialized ? 'current-password' : 'new-password';
  password.input.required = true;
  password.input.minLength = state.initialized ? 1 : 12;
  form.append(password.wrap);
  const confirmation = field('Confirm master password', 'password');
  confirmation.input.autocomplete = 'new-password';
  confirmation.input.required = true;
  if (!state.initialized)
    form.append(
      confirmation.wrap,
      el(
        'p',
        'notice warning',
        'There is no password recovery. If you forget it, you must reset the vault and import your accounts again.',
      ),
    );
  const status = liveRegion();
  const submit = button(
    state.initialized ? 'Unlock vault' : 'Create encrypted vault',
    () => {},
    'primary',
  );
  submit.type = 'submit';
  form.append(status, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      if (!state.initialized && password.input.value !== confirmation.input.value) {
        message(status, 'The passwords do not match.', true);
        return;
      }
      submit.disabled = true;
      message(status, 'Opening your local vault…');
      try {
        await request({
          type: state.initialized ? 'UNLOCK' : 'SETUP',
          password: password.input.value,
        });
        password.input.value = '';
        confirmation.input.value = '';
        await onDone();
      } catch (error) {
        password.input.value = '';
        confirmation.input.value = '';
        message(status, error instanceof Error ? error.message : 'Could not open the vault.', true);
        submit.disabled = false;
      }
    })();
  });
  return form;
}
export function confirmDialog(
  titleText: string,
  body: string,
  confirmLabel: string,
  onConfirm: () => Promise<void>,
) {
  const d = el('dialog', 'confirm-dialog');
  const form = el('div', 'stack');
  const status = liveRegion();
  form.append(el('h2', '', titleText), el('p', 'subtle', body), status);
  const actions = el('div', 'actions');
  const cancel = button('Cancel', () => d.close());
  const yes = button(
    confirmLabel,
    async () => {
      yes.disabled = true;
      cancel.disabled = true;
      try {
        await onConfirm();
        d.close();
      } catch (error) {
        message(status, error instanceof Error ? error.message : 'Action failed.', true);
        yes.disabled = false;
        cancel.disabled = false;
      }
    },
    'danger',
  );
  actions.append(cancel, yes);
  form.append(actions);
  d.append(form);
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  cancel.focus();
}
export function resetButton(done: () => Promise<void>) {
  return button(
    'Reset vault',
    () =>
      confirmDialog(
        'Reset this vault?',
        'This permanently deletes all accounts, history, profile settings and website permission. There is no Undo.',
        'Delete vault',
        async () => {
          await request({ type: 'RESET' });
          await done();
        },
      ),
    'text-button danger-text',
  );
}
export function slashSearch(input: HTMLInputElement, isUnlocked: () => boolean) {
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (
      event.key === '/' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      isUnlocked() &&
      !(
        target instanceof HTMLElement &&
        target.closest('input,textarea,select,[contenteditable="true"]')
      )
    ) {
      event.preventDefault();
      input.focus();
    }
  });
}
