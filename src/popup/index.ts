import type { AccountSummary, AppState } from '../shared/types';
import {
  accountRow,
  button,
  el,
  featuredHeading,
  icon,
  iconButton,
  installActivityTracking,
  liveRegion,
  message,
  metadata,
  pagination,
  request,
  searchBox,
  sectionLabel,
  slashSearch,
  title,
  vaultForm,
  versionFooter,
} from '../ui/common';

const app = document.querySelector<HTMLElement>('#app')!;
const status = liveRegion();
const body = el('div', 'popup-body stack');
const header = el('header', 'app-header');
const top = el('div', 'header-line');
const brand = el('div', 'brand');
const logo = el('div', 'logo');
logo.append(icon('key'));
brand.append(logo, el('strong', '', 'OneChat DEV Login Assistant'));
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
  url.hash = section;
  await chrome.tabs.create({ url: url.href });
}
actions.append(
  iconButton('external', 'Manage accounts', () => openOptions()),
  iconButton('settings', 'Settings', () => openOptions('profile')),
);
top.append(brand, actions);
header.append(top);
const strip = el('div', 'profile-strip');
header.append(strip);
const footer = el('footer', 'app-footer');
app.replaceChildren(header, status, body, footer, versionFooter());
const search = searchBox((value) => {
  query = value;
  page = 0;
  void refresh(true);
});
slashSearch(search.input, () => !!state && !state.locked);
installActivityTracking(() => !!state && !state.locked);
async function fill(account: AccountSummary) {
  if (busy) return;
  busy = true;
  body.querySelectorAll('button').forEach((b) => (b.disabled = true));
  message(status, 'Checking this page and filling the selected account…');
  try {
    await request({ type: 'FILL', accountId: account.accountId, tabId });
    await refresh();
    message(status, 'Fields filled — click Login on the website.');
  } catch (error) {
    await refresh();
    message(status, error instanceof Error ? error.message : 'Could not fill this page.', true);
  } finally {
    busy = false;
  }
}
function select(account: AccountSummary) {
  body.replaceChildren(
    button('← Back to accounts', () => render(), 'text-button'),
    sectionLabel('Confirm account'),
    el('h2', '', title(account)),
    el('p', 'mono', account.accountId),
    el('p', '', account.username),
    metadata(account),
    el(
      'p',
      'subtle',
      'Confirm this account before filling. You will still click Login on the website.',
    ),
  );
  const action = button('Autofill this account', () => fill(account), 'primary');
  action.disabled = !state?.authorized;
  body.append(action);
  action.focus();
}
function render(resultsOnly = false) {
  if (!state) return;
  const s = state;
  const profileLabel = s.profile
    ? `${s.profile.name} (${new URL(s.profile.login.origin).host})`
    : 'No login profile configured';
  const profileName = el('span', 'mono truncate', profileLabel);
  profileName.title = profileLabel;
  strip.replaceChildren(
    profileName,
    el(
      'span',
      s.authorized ? 'pill authorized' : 'pill',
      s.locked ? 'Locked' : s.authorized ? '● Authorized' : 'Not authorized',
    ),
  );
  footer.replaceChildren();
  if (s.locked) {
    body.replaceChildren(vaultForm(s, refresh));
    footer.append(
      el('span', 'subtle', 'Encrypted on this device'),
      button('Manage vault', () => openOptions(), 'text-button'),
    );
    return;
  }
  footer.append(
    el('span', 'mono subtle', `${s.total.toLocaleString()} imported accounts`),
    button(
      'Lock',
      async () => {
        try {
          await request({ type: 'LOCK' });
          message(status, 'Vault locked.');
          await refresh();
        } catch (error) {
          message(
            status,
            error instanceof Error ? error.message : 'Could not lock the vault.',
            true,
          );
        }
      },
      'text-button',
    ),
  );
  const oldResults = body.querySelector('#results');
  const results = el('div', 'stack');
  results.id = 'results';
  if (!query && s.recent.length) {
    results.append(sectionLabel('Recent accounts', s.recent.length));
    s.recent.forEach((a) => results.append(accountRow(a, () => select(a))));
  }
  results.append(sectionLabel(query ? 'Search results' : 'All accounts', s.matches));
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
  s.accounts.forEach((a) => results.append(accountRow(a, () => select(a))));
  if (s.matches > 50)
    results.append(
      pagination(s, (p) => {
        page = p;
        void refresh(true);
      }),
    );
  if (resultsOnly && oldResults) {
    oldResults.replaceWith(results);
    return;
  }
  body.replaceChildren();
  if (!s.authorized) {
    const note = el('div', 'notice warning');
    note.append(
      el(
        'p',
        '',
        s.profile
          ? 'Open the configured login page. Its exact URL and approved catalog rule must match before autofill.'
          : 'Import accounts, then configure login fields for your website.',
      ),
      button('Configure login fields', () => openOptions('profile'), 'text-button'),
    );
    body.append(note);
  }
  body.append(sectionLabel('Last successful account'));
  if (s.lastSuccessful) {
    const account = s.lastSuccessful;
    const featured = el('article', 'featured stack');
    featured.append(
      featuredHeading(account),
      el('span', 'mono subtle wrap', `ID: ${account.accountId}`),
      el('div', 'credential mono', account.username),
    );
    const fillButton = button(`↪ Autofill ${account.username}`, () => fill(account), 'primary');
    fillButton.disabled = !s.authorized;
    featured.append(fillButton);
    if (s.lastSuccessfulAt) {
      const date = new Date(s.lastSuccessfulAt);
      const stamp = el(
        'time',
        'subtle italic',
        `Last successful login at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
      );
      stamp.dateTime = date.toISOString();
      stamp.title = date.toLocaleString();
      stamp.setAttribute('aria-label', `Last successful login: ${date.toLocaleString()}`);
      featured.append(stamp);
    }
    body.append(featured);
  } else body.append(el('div', 'empty compact', 'No confirmed successful login yet.'));
  const label = sectionLabel('Search accounts');
  label.append(el('span', '', 'Press / to focus'));
  body.append(label, search.wrap, results);
  search.input.value = query;
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
    tabId = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  } catch {
    /* An unavailable tab keeps autofill disabled. */
  }
  await refresh();
})();
