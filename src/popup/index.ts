import type { AccountSummary, AppState } from '../shared/types';
import {
  accountRow,
  groupPicker,
  currentGroup,
  chooseGroup,
  button,
  copyActions,
  el,
  icon,
  iconButton,
  liveRegion,
  message,
  metadata,
  pagination,
  request,
  searchBox,
  sectionLabel,
  slashSearch,
  title,
  migrationForm,
  versionFooter,
} from '../ui/common';

const app = document.querySelector<HTMLElement>('#app')!;
const appName = chrome.runtime.getManifest().name;
document.title = appName;
const status = liveRegion();
const body = el('div', 'popup-body stack');
const header = el('header', 'app-header');
const top = el('div', 'header-line');
const brand = el('div', 'brand');
const logo = el('div', 'logo');
logo.setAttribute('aria-hidden', 'true');
brand.append(logo, el('strong', '', appName));
const actions = el('div', 'header-actions');
let tabId: number | undefined,
  state: AppState | undefined,
  query = '',
  page = 0,
  sequence = 0,
  busy = false;
async function openOptions(section = 'accounts') {
  const url = new URL(chrome.runtime.getURL('options.html'));
  if (tabId !== undefined) url.searchParams.set('sourceTab', String(tabId));
  url.searchParams.set('group', currentGroup());
  url.hash = section;
  await chrome.tabs.create({ url: url.href });
}
actions.append(iconButton('settings', 'Settings', () => openOptions('profile')));
top.append(brand, actions);
header.append(top);
const strip = el('div', 'profile-strip');
header.append(strip);
const footer = el('footer', 'app-footer');
const groupBar = el('div', 'group-bar');
app.replaceChildren(header, groupBar, status, body, footer);
const search = searchBox((value) => {
  query = value;
  page = 0;
  void refresh(true);
});
slashSearch(search.input, () => !!state && !state.migrationRequired);
const FILL_FEEDBACK_MS = 2500;
type FillSection = 'recent' | 'all';
let fillFeedback: { accountId: string; section: FillSection; ok: boolean } | undefined;
let fillFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * A fill triggers a re-render, so the outcome is held in state and re-applied
 * to the row's button after each render instead of being shown as a banner.
 */
function markFill(accountId: string, section: FillSection, ok: boolean) {
  fillFeedback = { accountId, section, ok };
  clearTimeout(fillFeedbackTimer);
  fillFeedbackTimer = setTimeout(() => {
    fillFeedback = undefined;
    render();
  }, FILL_FEEDBACK_MS);
}
/**
 * Re-rendering rebuilds every row, which would collapse an expanded card while
 * the user is still copying values out of it. Remember which cards are open and
 * restore them after each render, the same way fill feedback is re-applied.
 * Session storage carries the set across popup closes, so pasting a copied
 * value into the page and reopening the popup lands back on the same card.
 */
const OPEN_DETAILS_KEY = 'popup-open-details';
const openDetails = new Set<string>();
async function restoreOpenDetails() {
  try {
    const stored = (await chrome.storage.session.get(OPEN_DETAILS_KEY))[OPEN_DETAILS_KEY];
    if (Array.isArray(stored))
      for (const key of stored) if (typeof key === 'string') openDetails.add(key);
  } catch {
    /* A fresh browser session simply starts with every card collapsed. */
  }
}
function persistOpenDetails() {
  void chrome.storage.session.set({ [OPEN_DETAILS_KEY]: [...openDetails] }).catch(() => {});
}
function applyOpenDetails() {
  body.querySelectorAll<HTMLElement>('.account-row').forEach((row) => {
    const details = row.querySelector('details.metadata');
    if (!row.dataset.account || !(details instanceof HTMLDetailsElement)) return;
    // The same account appears under both Recent and All accounts; expand only
    // the copy the user opened.
    const key = `${row.dataset.section ?? ''}:${row.dataset.account}`;
    details.open = openDetails.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) openDetails.add(key);
      else openDetails.delete(key);
      persistOpenDetails();
    });
  });
}
function applyFillFeedback() {
  if (!fillFeedback) return;
  const outcome = fillFeedback;
  // The same account appears under both Recent and All accounts; mark only the
  // row the user actually used.
  const button = body.querySelector<HTMLButtonElement>(
    `.account-row[data-account="${CSS.escape(outcome.accountId)}"][data-section="${outcome.section}"] .select-button`,
  );
  if (!button) return;
  button.classList.add(outcome.ok ? 'fill-ok' : 'fill-fail');
  button.title = outcome.ok
    ? 'Fields filled — click Login on the website.'
    : 'Could not fill this page.';
  button.replaceChildren(icon(outcome.ok ? 'check' : 'cross'));
}
/** Add page identity context only to the account's Account details disclosure. */
function appendIdentityDetails(details: HTMLElement | null, account: AccountSummary) {
  const identity =
    account.applicationIdentity ??
    (state?.applicationIdentity &&
    (!account.groupId || account.groupId === state.applicationIdentity.groupId)
      ? state.applicationIdentity
      : undefined);
  if (!details || !identity) return;

  const dl = details.querySelector('dl');
  if (!dl) return;
  const addRow = (label: string, value: string) => {
    dl.append(el('dt', '', label), el('dd', '', value));
  };
  addRow('Page title', identity.title?.trim() || 'Unavailable');
  addRow(
    'Title rule',
    identity.rule
      ? `${identity.rule.mode === 'contains' ? 'Contains' : 'Exactly'} “${identity.rule.value}”`
      : 'Not configured',
  );
  addRow(
    'Title match',
    !identity.rule
      ? 'Not configured'
      : identity.status === 'unavailable'
        ? 'Unavailable'
        : identity.matched
          ? 'Matched'
          : identity.status === 'choice-required'
            ? identity.selected
              ? 'No match — selected manually'
              : 'Choose an application'
            : 'No match',
  );
}
function appendApplicationIdentity(row: HTMLElement, account: AccountSummary) {
  appendIdentityDetails(row.querySelector('details.metadata'), account);
}
function appendGroupLabel(row: HTMLElement, account: AccountSummary) {
  if (!account.groupName) return;
  row
    .querySelector('.account-content')
    ?.append(el('p', 'scope mono truncate', `Group · ${account.groupName}`));
}
async function fill(account: AccountSummary, section: FillSection = 'recent') {
  if (busy) return;
  busy = true;
  body.querySelectorAll('button').forEach((b) => (b.disabled = true));
  message(status, 'Checking this page and filling the selected account…');
  try {
    await request({
      type: 'FILL',
      accountId: account.accountId,
      tabId,
      groupId: account.groupId ?? currentGroup(),
      fromSearch: !!query.trim(),
    });
    markFill(account.accountId, section, true);
    message(status, '');
    await refresh();
  } catch (error) {
    markFill(account.accountId, section, false);
    await refresh();
    // Failures still need an explanation; success does not.
    message(status, error instanceof Error ? error.message : 'Could not fill this page.', true);
  } finally {
    busy = false;
  }
}
function select(account: AccountSummary) {
  const heading = el('div', 'confirm-heading');
  heading.append(el('h2', '', title(account)), copyActions(account));
  const accountDetails = metadata(account);
  appendIdentityDetails(accountDetails, account);
  body.replaceChildren(
    button('← Back to accounts', () => render(), 'text-button'),
    sectionLabel('Confirm account'),
    heading,
    el('p', 'mono', account.accountId),
    el('p', '', account.username),
    accountDetails,
    el(
      'p',
      'subtle',
      'Confirm this account before filling. You will still click Login on the website.',
    ),
  );
  const action = button('Autofill this account', () => fill(account), 'primary');
  action.disabled = !state?.authorized && !(query.trim() && account.groupId);
  body.append(action);
  action.focus();
}
function render(resultsOnly = false) {
  if (!state) return;
  const s = state;
  if (s.applicationIdentity?.matched && s.applicationIdentity.groupId)
    chooseGroup(s.applicationIdentity.groupId);
  const profileLabel = s.profile
    ? `${s.profile.name} (${s.profile.logins.map((l) => new URL(l.origin).host).join(', ')})`
    : 'No login profile configured';
  const profileName = el('span', 'mono truncate', profileLabel);
  profileName.title = profileLabel;
  strip.replaceChildren(
    profileName,
    el(
      'span',
      s.authorized ? 'pill authorized' : 'pill',
      s.migrationRequired ? 'Migration needed' : s.authorized ? '● Authorized' : 'Not configured',
    ),
  );
  groupBar.replaceChildren(
    groupPicker(
      s,
      () => {
        query = '';
        page = 0;
        void refresh();
      },
      () => busy,
    ),
  );
  footer.replaceChildren(versionFooter());
  if (s.migrationRequired) {
    body.replaceChildren(migrationForm(refresh));
    footer.append(
      el('span', 'subtle', 'Existing catalog'),
      button('Manage accounts', () => openOptions(), 'text-button'),
    );
    return;
  }
  // The imported total lives next to the All accounts heading, leaving the
  // footer strip to the action and the credit on one line.
  footer.append(button('Manage accounts', () => openOptions(), 'text-button'));
  const oldResults = body.querySelector('#results');
  const results = el('div', 'stack');
  results.id = 'results';
  if (!query && s.recent.length) {
    results.append(sectionLabel('Recent accounts', s.recent.length));
    s.recent.forEach((a) => {
      const row = accountRow(
        a,
        () => fill(a, 'recent'),
        false,
        '',
        () => select(a),
      );
      row.dataset.section = 'recent';
      appendApplicationIdentity(row, a);
      results.append(row);
    });
  }
  const allLabel = sectionLabel(query ? 'Search results' : 'All accounts', s.matches);
  allLabel.insertBefore(
    el('span', 'mono subtle', `${s.total.toLocaleString()} imported`),
    allLabel.lastChild,
  );
  results.append(allLabel);
  if (!s.accounts.length)
    results.append(
      el(
        'div',
        'empty',
        s.total
          ? 'No accounts match. Try a different search.'
          : 'No accounts yet. Import a CSV in Settings to get started.',
      ),
    );
  s.accounts.forEach((a) => {
    const row = accountRow(
      a,
      () => fill(a, 'all'),
      false,
      '',
      () => select(a),
    );
    row.dataset.section = 'all';
    appendGroupLabel(row, a);
    appendApplicationIdentity(row, a);
    results.append(row);
  });
  if (s.matches > 50)
    results.append(
      pagination(s, (p) => {
        page = p;
        void refresh(true);
      }),
    );
  if (resultsOnly && oldResults) {
    oldResults.replaceWith(results);
    applyOpenDetails();
    applyFillFeedback();
    return;
  }
  body.replaceChildren();
  if (s.applicationIdentity && !s.applicationIdentity.selected && !s.applicationIdentity.matched) {
    const selection = el('div', 'notice warning');
    selection.append(
      el('p', '', 'Choose which application is open before browsing its accounts.'),
      button(
        `Use ${s.groups?.find((group) => group.id === currentGroup())?.name ?? 'selected group'} for this tab`,
        async () => {
          if (tabId === undefined) return;
          try {
            await request({ type: 'CHOOSE_GROUP', groupId: currentGroup(), tabId });
            await refresh();
          } catch (error) {
            message(
              status,
              error instanceof Error ? error.message : 'Choose a different group.',
              true,
            );
          }
        },
        'text-button',
      ),
    );
    body.append(selection);
  }
  if (!s.authorized) {
    const note = el('div', 'notice warning');
    note.append(
      el(
        'p',
        '',
        s.profile
          ? 'Open the configured login page. Its exact URL and approved catalog rule must match before autofill.'
          : 'Import a dataset, then configure login fields for your website.',
      ),
      button('Configure login fields', () => openOptions('profile'), 'text-button'),
    );
    body.append(note);
  }
  const label = sectionLabel('Search accounts');
  label.append(el('span', '', 'Press / to focus'));
  body.append(label, search.wrap, results);
  search.input.value = query;
  applyOpenDetails();
  applyFillFeedback();
}
async function refresh(resultsOnly = false) {
  const current = ++sequence;
  try {
    const next = await request<AppState>({ type: 'STATE', query, page, tabId });
    if (current !== sequence) return;
    state = next;
    render(resultsOnly);
  } catch (error) {
    message(status, error instanceof Error ? error.message : 'Could not load accounts.', true);
  }
}
chrome.runtime.onMessage.addListener((event: unknown) => {
  if (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    event.type === 'STATE_CHANGED'
  )
    void refresh();
});
void (async () => {
  try {
    const rawSource = new URL(location.href).searchParams.get('sourceTab');
    tabId =
      rawSource !== null && /^\d+$/.test(rawSource)
        ? Number(rawSource)
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  } catch {
    /* An unavailable tab keeps autofill disabled. */
  }
  await restoreOpenDetails();
  await refresh();
})();
