import type { AccountSummary, AppState, Command, Reply } from '../shared/types';

let selectedGroup =
  typeof location === 'undefined'
    ? 'default'
    : (new URL(location.href).searchParams.get('group') ?? 'default');
export function currentGroup() {
  return selectedGroup;
}
export function chooseGroup(id: string) {
  selectedGroup = id;
}
export function groupPicker(state: AppState, onChange: () => void, isBusy: () => boolean) {
  const wrap = el('label', 'group-picker');
  wrap.append(el('span', 'subtle', 'CSV group'));
  const select = el('select');
  select.setAttribute('aria-label', 'CSV group');
  for (const group of state.groups ?? [{ id: 'default', name: 'Imported accounts' }]) {
    const option = el('option', '', group.name);
    option.value = group.id;
    select.append(option);
  }
  select.value = currentGroup();
  select.addEventListener('change', () => {
    if (isBusy()) {
      select.value = currentGroup();
      return;
    }
    chooseGroup(select.value);
    onChange();
  });
  wrap.append(select);
  return wrap;
}

export function versionFooter(): HTMLElement {
  const footer = el('div', 'version-footer');
  footer.append(
    el('span', '', `v${chrome.runtime.getManifest().version}`),
    el('span', '', 'Crafted by metuur'),
  );
  return footer;
}

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
  name:
    | 'key'
    | 'settings'
    | 'external'
    | 'back'
    | 'trash'
    | 'search'
    | 'upload'
    | 'shield'
    | 'copy'
    | 'check'
    | 'cross'
    | 'details',
): SVGSVGElement {
  const paths = {
    copy: 'M9 9h10v12H9zM15 5H5v12h2',
    details: 'm9 5 7 7-7 7',
    check: 'm5 13 4 4 10-10',
    cross: 'm6 6 12 12M18 6 6 18',
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
    reply = (await chrome.runtime.sendMessage({ ...command, groupId: selectedGroup })) as Reply<T>;
  } catch {
    throw new Error('The extension is unavailable. Reopen it and try again.');
  }
  if (!reply?.ok)
    throw new Error(
      reply && !reply.ok ? reply.error : 'The extension could not complete that action.',
    );
  return reply.data;
}

/** `true` stays shorthand for an error so existing call sites keep working. */
export type Tone = 'info' | 'success' | 'warning' | 'error';
export function message(target: HTMLElement, text: string, tone: Tone | boolean = 'info') {
  target.textContent = text;
  target.className = `notice ${tone === true ? 'error' : tone === false ? 'info' : tone}`;
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
const COPY_FEEDBACK_MS = 2000;
/** Writes a value to the clipboard without ever placing it in the DOM. */
function copyIconButton(
  noun: string,
  read: () => Promise<string>,
  status: HTMLElement,
  showLabel = false,
) {
  // The glyph lives in its own span so success/failure feedback can swap the
  // icon without discarding a visible label.
  const glyph = el('span', 'copy-glyph');
  glyph.append(icon('copy'));
  const b = button('', async () => {
    if (b.disabled) return;
    b.disabled = true;
    let ok = true;
    // Report which stage failed: reading the value from the background and
    // writing it to the clipboard fail for very different reasons.
    let failure = '';
    let value: string | undefined;
    try {
      value = await read();
    } catch (error) {
      ok = false;
      failure = `Could not read the ${noun}: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
    if (ok)
      try {
        await navigator.clipboard.writeText(value!);
      } catch (error) {
        ok = false;
        failure = `Could not reach the clipboard: ${error instanceof Error ? error.message : 'unknown error'}`;
      }
    b.classList.add(ok ? 'copy-ok' : 'copy-fail');
    glyph.replaceChildren(icon(ok ? 'check' : 'cross'));
    b.title = ok ? `Copy ${noun}` : failure;
    status.textContent = ok
      ? `${noun[0].toUpperCase()}${noun.slice(1)} copied to the clipboard.`
      : failure;
    setTimeout(
      () => {
        b.classList.remove('copy-ok', 'copy-fail');
        glyph.replaceChildren(icon('copy'));
        b.title = `Copy ${noun}`;
        b.disabled = false;
      },
      // Leave a failure on screen long enough to read it.
      ok ? COPY_FEEDBACK_MS : COPY_FEEDBACK_MS * 4,
    );
  });
  b.className = showLabel ? 'icon-button copy-icon has-label' : 'icon-button copy-icon';
  b.setAttribute('aria-label', `Copy ${noun}`);
  b.title = `Copy ${noun}`;
  b.append(glyph);
  if (showLabel) b.append(el('span', 'copy-label', noun));
  return b;
}
function copyStatus() {
  const status = el('span', 'sr-only');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  return status;
}
function readPassword(account: AccountSummary) {
  return () => request<string>({ type: 'COPY_PASSWORD', accountId: account.accountId });
}
/** Standalone copy controls for views that show an account outside the detail list. */
export function copyActions(account: AccountSummary) {
  const wrap = el('div', 'copy-actions');
  const status = copyStatus();
  wrap.append(
    copyIconButton('username', async () => account.username, status, true),
    copyIconButton('password', readPassword(account), status, true),
    status,
  );
  return wrap;
}
export function metadata(account: AccountSummary) {
  const details = el('details', 'metadata');
  details.append(el('summary', '', 'Account details'));
  const status = copyStatus();
  const dl = el('dl');
  const row = (key: string, value: string, read?: () => Promise<string>, masked = false) => {
    const dd = el('dd');
    const text = el('span', 'copy-value', value);
    if (masked) text.setAttribute('aria-hidden', 'true');
    dd.append(text);
    if (read) dd.append(copyIconButton(key, read, status));
    dl.append(el('dt', '', key), dd);
  };
  row('account_id', account.accountId);
  row('username', account.username, async () => account.username);
  row('password', '••••••••', readPassword(account), true);
  for (const [key, value] of Object.entries(account.metadata)) row(key, value);
  details.append(dl, status);
  return details;
}
export function accountRow(
  account: AccountSummary,
  action: () => unknown,
  management = false,
  origin = '',
  onDetails?: () => unknown,
) {
  const row = el('article', 'account-row');
  row.dataset.account = account.accountId;
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
    : button('Fill it…', action, 'select-button');
  if (onDetails) {
    const actions = el('div', 'row-actions');
    actions.append(act, iconButton('details', `Open ${account.accountId} details`, onDetails));
    row.append(avatar, content, actions);
  } else row.append(avatar, content, act);
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
export function migrationForm(onDone: () => Promise<void>) {
  const form = el('form', 'vault-form panel');
  form.append(
    el('h1', '', 'Keep your existing accounts'),
    el(
      'p',
      'subtle',
      'This catalog was saved with a master password. Enter it once to migrate to password-free synthetic-data storage. Future visits open directly. You can also reset and reimport your CSV in Settings.',
    ),
  );
  const password = field('Previous master password', 'password');
  password.input.autocomplete = 'current-password';
  password.input.required = true;
  const status = liveRegion();
  const submit = button('Migrate accounts', () => {}, 'primary');
  submit.type = 'submit';
  form.append(password.wrap, status, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      submit.disabled = true;
      try {
        await request({ type: 'MIGRATE', password: password.input.value });
        password.input.value = '';
        await onDone();
      } catch (error) {
        password.input.value = '';
        message(
          status,
          error instanceof Error ? error.message : 'Could not migrate accounts.',
          true,
        );
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
  /** Not every confirmation is destructive; an explanation is not a warning. */
  confirmClass = 'danger',
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
    confirmClass,
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
    'Reset group',
    () =>
      confirmDialog(
        'Reset this CSV group?',
        'This permanently deletes this group’s accounts, history and profile settings. Other groups are untouched. There is no Undo.',
        'Reset group',
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
