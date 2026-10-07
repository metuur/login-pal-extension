import type {
  AppState,
  ImportMode,
  ImportPreview,
  ProfileInput,
  Route,
  FieldMatch,
  DetectResult,
  DetectTab,
} from '../shared/types';
import {
  parseRule,
  parseDomainRules,
  matchesAnyRule,
  validateProfile,
  isAuthorizedScheme,
  suggestMatch,
} from '../domain/rules';
import {
  accountRow,
  groupPicker,
  currentGroup,
  chooseGroup,
  button,
  confirmDialog,
  el,
  field,
  icon,
  liveRegion,
  message,
  pagination,
  request,
  resetButton,
  searchBox,
  sectionLabel,
  type Tone,
  slashSearch,
  migrationForm,
  versionFooter,
} from '../ui/common';

const app = document.querySelector<HTMLElement>('#app')!;
const header = el('header', 'app-header');
const headerLine = el('div', 'header-line');
const logo = el('div', 'logo');
logo.append(icon('key'));
const brand = el('div', 'brand');
const title = el('div');
title.append(el('strong', '', 'Account Login Assistant'), el('p', 'subtle', 'Account settings'));
brand.append(logo, title);
const badge = el('span', 'pill authorized');
const version = el('span', 'version mono', `v${chrome.runtime.getManifest().version}`);
headerLine.append(brand, version, badge);
header.append(headerLine);
const status = liveRegion(),
  content = el('div', 'options-body stack'),
  footer = el('footer', 'app-footer');
const groupBar = el('div', 'group-bar');
const tabs = el('div', 'settings-tabs');
tabs.setAttribute('role', 'tablist');
tabs.setAttribute('aria-label', 'Account settings');
app.replaceChildren(header, groupBar, tabs, status, content, footer);
const rawSource = new URL(location.href).searchParams.get('sourceTab');
const sourceTab = rawSource !== null && /^\d+$/.test(rawSource) ? Number(rawSource) : undefined;
let state: AppState | undefined,
  query = '',
  page = 0,
  sequence = 0,
  busy = false,
  mounted = false,
  preview: ImportPreview | undefined,
  file: File | undefined,
  mode: ImportMode = 'merge',
  undoTimer: ReturnType<typeof setTimeout> | undefined,
  deletedId = '',
  grantedOrigins: string[] = [];
const importPanel = el('section', 'import-panel panel stack');
importPanel.id = 'import';
const groupName = field('CSV group name');
groupName.input.maxLength = 80;
groupName.input.placeholder = 'QA Platform X';
const groupActions = el('div', 'actions');
const groupEditor = el('div', 'group-editor');
groupActions.append(
  button('Save group name', () =>
    mutate(async () => {
      await request({ type: 'RENAME_GROUP', name: groupName.input.value });
      message(status, 'Group name saved.');
    }),
  ),
  button('Create new group', () =>
    mutate(async () => {
      const group = await request<{ id: string }>({
        type: 'CREATE_GROUP',
        name: groupName.input.value,
      });
      chooseGroup(group.id);
      mounted = false;
      file = undefined;
      fileInput.value = '';
      fileName.textContent = 'Choose an account CSV';
      invalidatePreview();
      query = '';
      page = 0;
      message(status, 'Group created. Choose its CSV and authorized URL.');
    }),
  ),
);
const importHeading = sectionLabel('↥ Import CSV dataset');
const step = el('span', 'step', 'Step 1 of 2');
importHeading.append(step);
const fileInput = el('input');
fileInput.type = 'file';
fileInput.accept = '.csv,text/csv';
fileInput.id = 'csv-file';
fileInput.className = 'file-input';
const fileName = el('strong', '', 'Choose an account CSV'),
  fileInfo = el('p', 'mono subtle', 'UTF-8 · up to 2 MiB');
const fileCard = el('div', 'file-card');
const fileText = el('div', 'grow');
fileText.append(fileName, fileInfo);
const change = button('Choose file', () => fileInput.click());
const another = button('Upload another CSV', () => {
  mode = 'merge';
  modeWrap.querySelectorAll<HTMLInputElement>('input').forEach((radio) => {
    radio.checked = radio.value === 'merge';
  });
  modeExplanation.textContent =
    'Adds and updates matching IDs in this group. Existing accounts absent from this file are preserved.';
  invalidatePreview();
  fileInput.value = '';
  file = undefined;
  fileName.textContent = 'Choose an account CSV';
  change.textContent = 'Choose file';
  fileInput.click();
});
const sample = el('a', 'sample-link', 'Download sample CSV (3 rows)');
sample.href = chrome.runtime.getURL('sample-accounts.csv');
sample.download = 'sample-accounts.csv';
const fileIcon = el('div', 'avatar');
fileIcon.append(icon('upload'));
fileCard.append(fileIcon, fileText, change, fileInput);
const target = field('Authorized domain *');
target.input.required = true;
target.input.placeholder = 'https://your-website.example, https://staging.your-website.example';
target.input.autocomplete = 'off';
target.input.spellcheck = false;
const presets = el('div', 'presets');
const modeWrap = el('fieldset', 'mode-switch');
modeWrap.append(el('legend', 'sr-only', 'Import mode'));
const modeExplanation = el(
  'p',
  'subtle',
  'Adds and updates matching IDs. Accounts absent from this file are preserved.',
);
for (const [value, label] of [
  ['merge', 'Merge & Update'],
  ['replace', 'Wipe & Replace'],
] as const) {
  const wrap = el('label');
  const radio = el('input');
  radio.type = 'radio';
  radio.name = 'import-mode';
  radio.value = value;
  radio.checked = value === 'merge';
  radio.addEventListener('change', () => {
    mode = value;
    invalidatePreview();
    modeExplanation.textContent =
      value === 'merge'
        ? 'Adds and updates matching IDs. Accounts absent from this file are preserved.'
        : 'Replaces accounts in this CSV group only. Accounts missing from valid incoming rows are removed.';
  });
  wrap.append(radio, el('span', '', label));
  modeWrap.append(wrap);
}
const previewBox = el('div', 'stack');
const verify = button('Verify accounts', verifyImport, 'primary');
const importError = liveRegion();
const importSetup = el('div', 'stack import-setup');
const fileActions = el('div', 'actions file-actions');
another.className = 'text-button';
fileActions.append(sample, another);
groupEditor.append(groupName.wrap, groupActions);
const domainHelp = el('details', 'settings-help');
domainHelp.append(
  el('summary', '', 'Which domains can I use?'),
  el(
    'p',
    'subtle',
    'Enter the HTTPS domain, for example https://qa.example.com, or http://localhost:3000 for a local server. Separate several domains with commas to authorize the same application on more than one environment; they share one set of login field selectors. Paths, queries and fragments are ignored. Subdomains and ports must match.',
  ),
);
// A group's authorized domain is set at import. Allow re-pointing it at
// another site without forcing a full CSV re-import.
const changeDomain = button(
  'Change this group domain',
  () => {
    const value = target.input.value.trim();
    let rule: string;
    try {
      rule = parseDomainRules(value)
        .map((r) => r.origin)
        .join(', ');
    } catch {
      message(importError, 'Enter a valid authorized domain before changing it.', true);
      return;
    }
    confirmDialog(
      'Change this group domain?',
      `Accounts in "${state?.groupName ?? 'this group'}" will be allowed on ${rule} instead of ${state?.rules.join(', ') || 'the current domain'}. The saved login profile stops filling until you reopen Login page setup and save it again for the new domains.`,
      'Change domain',
      async () => {
        await request({ type: 'SET_CATALOG_RULE', rule: value });
        await refresh();
        // Keep the profile's login domain matched to the new authorized domain.
        login.input.value = rule;
        message(
          importError,
          `Group domain changed to ${rule}. Open Login page setup and save the profile again.`,
        );
      },
    );
  },
  'text-button',
);
const changeDomainRow = el('div', 'stack change-domain');
changeDomainRow.append(
  el(
    'p',
    'subtle',
    'This group is already imported. Changing its domain does not need a CSV file.',
  ),
  changeDomain,
);
changeDomainRow.hidden = true;
/** Offer the change only when the typed domain really differs from the saved one. */
function updateChangeDomain() {
  const current = (state?.rules ?? []).join(' ');
  const value = target.input.value.trim();
  let differs = false;
  try {
    differs =
      !!current &&
      !!value &&
      parseDomainRules(value)
        .map((r) => r.origin)
        .sort()
        .join(' ') !== [...(state?.rules ?? [])].sort().join(' ');
  } catch {
    differs = false;
  }
  changeDomainRow.hidden = !differs;
  if (differs) changeDomain.textContent = `Change group domain to ${value}`;
}
target.input.addEventListener('input', updateChangeDomain);
const domainFields = el('div', 'stack');
domainFields.append(target.wrap, presets, changeDomainRow, domainHelp);
importSetup.append(
  groupEditor,
  fileCard,
  fileActions,
  domainFields,
  modeWrap,
  modeExplanation,
  verify,
);
importPanel.append(importHeading, importError, importSetup, previewBox);
const accountsPanel = el('section', 'stack');
accountsPanel.id = 'accounts';
const list = el('div', 'stack'),
  listHeading = el('div', 'section-label'),
  undo = el('div', 'notice info');
undo.hidden = true;
const search = searchBox((value) => {
  query = value;
  page = 0;
  void refresh();
});
accountsPanel.append(listHeading, undo, search.wrap, list);
slashSearch(search.input, () => !!state && !state.migrationRequired && activeTab === 'accounts');
const profilePanel = el('section', 'panel profile-panel stack');
profilePanel.id = 'profile';
profilePanel.append(el('h2', '', 'Login page setup'));

type SettingsTab = 'import' | 'accounts' | 'profile';
let activeTab: SettingsTab = 'import';
const tabPanels = { import: importPanel, accounts: accountsPanel, profile: profilePanel };
const tabButtons = new Map<SettingsTab, HTMLButtonElement>();
for (const [id, label] of [
  ['import', 'Import CSV'],
  ['accounts', 'Indexed accounts'],
  ['profile', 'Login page setup'],
] as const) {
  const tab = button(label, () => selectTab(id), 'settings-tab');
  tab.id = `tab-${id}`;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', id);
  const panel = tabPanels[id];
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tab.id);
  panel.tabIndex = 0;
  tabButtons.set(id, tab);
  tabs.append(tab);
  tab.addEventListener('keydown', (event) => {
    const ids = [...tabButtons.keys()];
    const index = ids.indexOf(id);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? ids.length - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % ids.length
            : event.key === 'ArrowLeft'
              ? (index + ids.length - 1) % ids.length
              : -1;
    if (next < 0 || busy) return;
    event.preventDefault();
    selectTab(ids[next], true);
  });
}
function selectTab(id: SettingsTab, focus = false) {
  activeTab = id;
  for (const [key, tab] of tabButtons) {
    const selected = key === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tabPanels[key].hidden = !selected;
  }
  content.scrollTop = 0;
  if (focus) {
    const tab = tabButtons.get(id);
    if (tab?.disabled) tabPanels[id].focus();
    else tab?.focus();
  }
}
function tabFromHash(): SettingsTab {
  return location.hash === '#profile'
    ? 'profile'
    : location.hash === '#accounts'
      ? 'accounts'
      : 'import';
}
window.addEventListener('hashchange', () => selectTab(tabFromHash()));

const profileForm = el('form', 'stack');
const defaultUsernameSelector = [
  'input[autocomplete~="username"]',
  'input[type="email"]',
  'input[name="username" i]',
  'input[name="email" i]',
  'input[name="login" i]',
  'input[id="username" i]',
  'input[id="email" i]',
  'input[id="login" i]',
].join(', ');
const defaultPasswordSelector = 'input[type="password"]';
const profileName = field('Profile name'),
  login = field('Authorized login domain'),
  usernameSelector = field('Username field CSS selector'),
  passwordSelector = field('Password field CSS selector'),
  successUrl = field('Exact success / observation URL', 'url'),
  successSelector = field('Visible success element CSS selector');
for (const f of [profileName, login, usernameSelector, passwordSelector, successUrl])
  f.input.required = true;
function matchingControl(label: string, target: ReturnType<typeof field>, password: boolean) {
  const wrap = el('label', 'field');
  const select = el('select');
  select.setAttribute('aria-label', `${label} match method`);
  const choices = [
    ['css', 'CSS selector', password ? 'input[type="password"]' : 'input[name="username"]'],
    ['id', 'Input ID', password ? 'password' : 'email'],
    ['name', 'Input name', password ? 'password' : 'username'],
    ['autocomplete', 'Autocomplete token', password ? 'current-password' : 'username'],
    ['placeholder', 'Placeholder text', password ? 'Enter password' : 'Email address'],
    ['label', 'Visible label text', password ? 'Password' : 'Email'],
    ['aria-label', 'Accessible label (aria-label)', password ? 'Password' : 'Username'],
  ];
  for (const [value, text] of choices) {
    const option = el('option', '', text);
    option.value = value;
    select.append(option);
  }
  wrap.append(el('span', 'field-label', `${label} match method`), select);
  const update = () => {
    target.wrap.querySelector('.field-label')!.textContent =
      select.value === 'css' ? `${label} field CSS selector` : `${label} match value`;
    target.input.placeholder = choices.find((c) => c[0] === select.value)![2];
  };
  select.addEventListener('change', update);
  update();
  return { wrap, select, update };
}
const usernameMatch = matchingControl('Username', usernameSelector, false);
const passwordMatch = matchingControl('Password', passwordSelector, true);
const kind = el('select');
kind.setAttribute('aria-label', 'Success detection');
for (const [value, label] of [
  ['none', 'Do not track successful logins'],
  ['url', 'URL changes to success page'],
  ['element', 'A success element becomes visible'],
] as const) {
  const option = el('option', '', label);
  option.value = value;
  kind.append(option);
}
const kindLabel = el('label', 'field');
kindLabel.append(el('span', 'field-label', 'Successful login detection'), kind);

const profileStatus = liveRegion(),
  // Detection feedback belongs beside the tab chips it answers, not at the
  // bottom of the panel next to Save.
  detectStatus = liveRegion(),
  save = button('Save & authorize website', () => {}, 'primary');
save.type = 'submit';
const profileIdentity = el('div', 'settings-grid');
profileIdentity.append(profileName.wrap, login.wrap);
const fieldMatching = el('div', 'settings-grid');
const usernameFields = el('div', 'stack');
usernameFields.append(usernameMatch.wrap, usernameSelector.wrap);
const passwordFields = el('div', 'stack');
passwordFields.append(passwordMatch.wrap, passwordSelector.wrap);
fieldMatching.append(usernameFields, passwordFields);
const matchingHelp = el('details', 'settings-help');
matchingHelp.append(
  el('summary', '', 'How field matching works'),
  el(
    'p',
    'subtle',
    'ID/name match exactly. Text labels and placeholders ignore case and extra spaces. Each method must resolve to one visible, writable input. CSS supports alternatives separated by commas, but must match exactly one input.',
  ),
);
const successFields = el('div', 'settings-grid');
successFields.append(kindLabel, successUrl.wrap, successSelector.wrap);
// The URL field means two different things depending on the detection mode, so
// relabel and explain it instead of leaving one ambiguous required field.
const successHint = el('p', 'subtle');
function updateSuccessFields() {
  const element = kind.value === 'element';
  const none = kind.value === 'none';
  successSelector.wrap.hidden = !element;
  successSelector.input.required = element;
  successUrl.wrap.hidden = none;
  successUrl.input.required = !none;
  successUrl.wrap.querySelector('.field-label')!.textContent = element
    ? 'Observation URL (page to watch)'
    : 'Exact success URL (after login)';
  successUrl.input.placeholder = element
    ? 'https://your-website.example/'
    : 'https://your-website.example/dashboard';
  successHint.textContent = none
    ? 'Autofill works without this. Tracking only records which account last signed in, shown as "Last successful account" in the popup.'
    : element
      ? 'The page where the success element appears, often the login page itself. Use this mode when the URL does not change after signing in.'
      : 'The exact URL the tab lands on after a successful login. Query strings are ignored, and it must differ from the login URL.';
  // Watching the login page itself is the normal case for element detection.
  if (element && !successUrl.input.value.trim() && login.input.value.trim())
    successUrl.input.value = login.input.value.trim();
}
kind.addEventListener('change', updateSuccessFields);
const selectorDefaults = el('div', 'actions');
selectorDefaults.append(
  button(
    'Use common selectors',
    () => {
      usernameMatch.select.value = 'css';
      passwordMatch.select.value = 'css';
      usernameMatch.update();
      passwordMatch.update();
      usernameSelector.input.value = defaultUsernameSelector;
      passwordSelector.input.value = defaultPasswordSelector;
      message(detectStatus, 'Common selectors restored. Save to apply them to this website.');
    },
    'text-button',
  ),
);
const detected = el('div', 'detected stack');
function applySuggestion(password: boolean, suggestion: { match: FieldMatch; value: string }) {
  const control = password ? passwordMatch : usernameMatch;
  const target = password ? passwordSelector : usernameSelector;
  control.select.value = suggestion.match;
  control.update();
  target.input.value = suggestion.value;
  message(
    detectStatus,
    `${password ? 'Password' : 'Username'} field set to ${suggestion.match} "${suggestion.value}". Save to apply it.`,
  );
}
/** Returns how many candidates it offered, so the caller can state the outcome. */
function renderDetected({ inputs, frames }: DetectResult) {
  detected.replaceChildren();
  // A page with no fields at all needs one cause, not two empty headings.
  if (!inputs.length) {
    detected.append(
      el(
        'p',
        'subtle',
        frames.length
          ? `That page keeps content inside an embedded frame (${frames.join(', ')}). This extension reads and fills only the page's own form, never a frame, so a login form placed there cannot be detected or filled.`
          : 'Open the step that shows the sign-in form in that tab, then detect again. A form built with closed web components also stays unreadable.',
      ),
    );
    return 0;
  }
  let offered = 0;
  for (const [heading, password] of [
    ['Username field candidates', false],
    ['Password field candidates', true],
  ] as const) {
    const group = inputs.filter((input) => input.password === password);
    const suggestions = group
      .map((input) => suggestMatch(input))
      .filter((s): s is { match: FieldMatch; value: string } => !!s);
    detected.append(el('p', 'field-label', heading));
    if (!suggestions.length) {
      detected.append(
        el(
          'p',
          'subtle',
          password
            ? 'No visible password field on that page. A two-step login shows it only after submitting the username.'
            : 'No visible text or email field on that page.',
        ),
      );
      continue;
    }
    const row = el('div', 'presets');
    for (const suggestion of suggestions)
      row.append(
        button(
          `${suggestion.match}: ${suggestion.value}`,
          () => applySuggestion(password, suggestion),
          'preset',
        ),
      );
    offered += suggestions.length;
    detected.append(row);
  }
  return offered;
}
/**
 * A CSV group is bound to the domain used at import, so a profile cannot point
 * elsewhere. Name the remedy instead of only stating the rule.
 */
function catalogMismatch(): string | null {
  const rules = state?.rules ?? [];
  if (!rules.length || !login.input.value.trim()) return null;
  try {
    const catalog = rules.map((r) => parseRule(r));
    const wanted = parseDomainRules(login.input.value);
    const stray = wanted.filter((w) => !matchesAnyRule(catalog, w.origin));
    if (!stray.length) return null;
    return `The CSV group "${state?.groupName ?? 'this group'}" authorizes ${rules.join(', ')}, so its profile cannot cover ${stray.map((r) => r.origin).join(', ')}. Add that domain to the group in Import CSV, or create a new group for it.`;
  } catch {
    return null;
  }
}
const tabChoices = el('div', 'tab-choices stack');
tabChoices.hidden = true;
function detectFailed(error: unknown, tone: Tone = 'error') {
  const catalogRule = state?.rules.join(', ');
  const reason = error instanceof Error ? error.message : 'The login page could not be read.';
  message(
    detectStatus,
    catalogRule
      ? `${reason} Open ${catalogRule} in another tab, leave it on the sign-in form, then detect again.`
      : reason,
    tone,
  );
}
/** Marks the clicked action itself as working, not only the status banner. */
async function withSpinner(target: HTMLButtonElement, action: () => Promise<void>) {
  const spinner = el('span', 'spinner');
  spinner.setAttribute('aria-hidden', 'true');
  target.prepend(spinner);
  target.classList.add('loading');
  target.setAttribute('aria-busy', 'true');
  const started = Date.now();
  try {
    await action();
  } finally {
    // Reading local tabs takes a few milliseconds, so hold the spinner long
    // enough to be seen rather than letting it flash and vanish.
    const remaining = 450 - (Date.now() - started);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    spinner.remove();
    target.classList.remove('loading');
    target.removeAttribute('aria-busy');
  }
}
function readTab(tabId: number, source: HTMLButtonElement) {
  void withSpinner(source, () =>
    mutate(async () => {
      try {
        const offered = renderDetected(
          await request<DetectResult>({ type: 'DETECT_FIELDS', tabId }),
        );
        // The panel carries the outcome, so drop the global pending banner.
        message(status, '');
        message(
          detectStatus,
          offered
            ? `Found ${offered} candidate ${offered === 1 ? 'field' : 'fields'}. Pick one to set the matching method and value.`
            : 'No login fields found on that page. The details below explain why.',
          offered ? 'success' : 'warning',
        );
      } catch (error) {
        detected.replaceChildren();
        detectFailed(error);
      }
    }, 'Reading the login page…'),
  );
}
/** Several tabs of one site share a title, so the path tells them apart. */
function tabLabel(tab: DetectTab) {
  let path = '';
  try {
    const { pathname } = new URL(tab.url);
    path = pathname === '/' ? '' : ` · ${pathname}`;
  } catch {
    path = '';
  }
  return `${tab.title}${path}`.slice(0, 80);
}
/** Settings runs in its own tab, so the user names the page to read. */
function renderTabChoices(tabs: DetectTab[]) {
  detected.replaceChildren();
  tabChoices.replaceChildren(el('p', 'field-label', 'Recent tabs on the authorized domain'));
  const row = el('div', 'presets');
  for (const tab of tabs) {
    const choice: HTMLButtonElement = button(
      tabLabel(tab),
      () => readTab(tab.id, choice),
      'preset',
    );
    choice.title = tab.url;
    row.append(choice);
  }
  tabChoices.append(row);
  // A short list reads as a failure unless the filter explains itself.
  const rules = state?.rules ?? [];
  if (tabs.length < 3 && rules.length)
    tabChoices.append(
      el(
        'p',
        'subtle',
        `Up to three of your most recently used tabs are listed. Only tabs open on ${rules.join(', ')} can be read, so open the login page in another tab to see it here.`,
      ),
    );
  tabChoices.hidden = false;
}
const detectButton = button(
  'Detect fields from the login page',
  () => {
    let origins: string[];
    try {
      // Tabs are listed by the group's authorized domains, so the grant must
      // cover those too. A domain added to the group after this profile was
      // saved is otherwise never granted, and its tab stays invisible here.
      const wanted = [
        ...parseDomainRules(login.input.value).map((r) => r.origin),
        ...(state?.rules ?? []),
      ];
      origins = [
        ...new Set(
          wanted.map((origin) => {
            const url = new URL(origin);
            return `${url.protocol}//${url.hostname}/*`;
          }),
        ),
      ];
    } catch {
      message(detectStatus, 'Enter the authorized login domain first, then detect.', true);
      return;
    }
    const mismatch = catalogMismatch();
    if (mismatch) {
      message(detectStatus, mismatch, true);
      return;
    }
    // Chrome owns the wording of its permission prompt, so explain the ask in
    // our own dialog first, and only when a grant is actually missing.
    const missing = origins.filter((origin) => !grantedOrigins.includes(origin));
    if (!missing.length) {
      requestAndDetect(origins);
      return;
    }
    confirmDialog(
      'Chrome will ask for access to these sites',
      `${missing.map((origin) => origin.replace(/^https?:\/\//u, '').replace(/\/\*$/u, '')).join(', ')}: this extension needs that access to list your open tabs on those sites and read the names of their login fields. It never reads what you type, and it fills a form only when you pick an account yourself.`,
      'Continue',
      () => {
        // Still inside a click, so Chrome keeps the prompt tied to the gesture.
        requestAndDetect(origins);
        return Promise.resolve();
      },
      'primary',
    );
  },
  'preset accent',
);
/** Chrome ties its prompt to a user gesture, so request before any await. */
function requestAndDetect(origins: string[]) {
  const permission = chrome.permissions.request({ origins });
  void withSpinner(detectButton, () =>
    mutate(async () => {
      if (!(await permission)) {
        message(detectStatus, 'Website permission was denied, so the page was not read.', true);
        return;
      }
      try {
        // Offer the three most recently used tabs already on the approved
        // domain; the user chooses which one detection reads.
        const tabs = await request<DetectTab[]>({ type: 'DETECT_TABS' });
        if (!tabs.length) {
          tabChoices.replaceChildren();
          tabChoices.hidden = true;
          message(status, '');
          detectFailed(new Error('No open tab is on the approved login domain.'), 'warning');
          return;
        }
        renderTabChoices(tabs);
        message(status, '');
        message(detectStatus, 'Choose the tab to read the login fields from.');
      } catch (error) {
        tabChoices.replaceChildren();
        tabChoices.hidden = true;
        detected.replaceChildren();
        detectFailed(error);
      }
    }, 'Looking for open tabs…'),
  );
}
selectorDefaults.append(detectButton);
profileForm.append(
  el(
    'p',
    'subtle',
    'A login profile tells the extension which website to fill, where its username and password fields are, and how to recognize a successful login. You submit the form yourself.',
  ),
  profileIdentity,
  fieldMatching,
  selectorDefaults,
  tabChoices,
  detectStatus,
  detected,
  el(
    'p',
    'subtle',
    'Common username/email and password selectors are prefilled for new profiles. If more than one field matches, narrow the selector to the login form.',
  ),
  matchingHelp,
  successFields,
  successHint,
  profileStatus,
  save,
);
profilePanel.append(profileForm);
function routeUrl(route: Route) {
  return route.origin + route.pathname + route.hash;
}
function populateProfile() {
  const p = state?.profile;
  profileName.input.value = p?.name ?? '';
  // A profile may only cover the group's authorized domains, so one saved
  // before a domain change starts from the current rules, not the stale value.
  const saved = p?.logins.map((l) => l.origin) ?? [];
  const rules = state?.rules ?? [];
  let matched = false;
  try {
    const catalog = rules.map((r) => parseRule(r));
    matched = !!saved.length && saved.every((origin) => matchesAnyRule(catalog, origin));
  } catch {
    matched = false;
  }
  login.input.value = matched ? saved.join(', ') : rules.join(', ');
  usernameMatch.select.value = p?.usernameMatch ?? 'css';
  passwordMatch.select.value = p?.passwordMatch ?? 'css';
  usernameMatch.update();
  passwordMatch.update();
  usernameSelector.input.value = p?.usernameSelector ?? defaultUsernameSelector;
  passwordSelector.input.value = p?.passwordSelector ?? defaultPasswordSelector;
  kind.value = p?.success?.kind ?? 'none';
  successUrl.input.value = p?.success ? routeUrl(p.success.route) : '';
  successSelector.input.value = p?.success?.kind === 'element' ? p.success.selector : '';
  updateSuccessFields();
}
function invalidatePreview() {
  preview = undefined;
  const wasReviewing = importSetup.hidden;
  importSetup.hidden = false;
  message(importError, '');
  previewBox.replaceChildren();
  step.textContent = 'Step 1 of 2';
  verify.hidden = false;
  if (wasReviewing && activeTab === 'import') verify.focus();
  fileInfo.textContent = file
    ? `${(file.size / 1024).toFixed(1)} KiB · not yet validated`
    : 'UTF-8 · up to 2 MiB';
}
target.input.addEventListener('input', invalidatePreview);
fileInput.addEventListener('change', () => {
  file = fileInput.files?.[0];
  invalidatePreview();
  fileName.textContent = file?.name ?? 'Choose an account CSV';
  change.textContent = file ? 'Change' : 'Choose file';
  message(importError, '');
});
async function verifyImport() {
  if (busy) return;
  message(importError, '');
  if (!file) {
    message(importError, 'Choose a CSV file first.', true);
    return;
  }
  if (!groupName.input.value.trim()) {
    message(importError, 'Enter a name for this CSV group.', true);
    groupName.input.focus();
    return;
  }
  if (!target.input.value.trim()) {
    message(importError, 'Enter the URL to match.', true);
    target.input.focus();
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    message(importError, 'The CSV exceeds the 2 MiB file limit.', true);
    return;
  }
  busy = true;
  setBusy(true);
  const chosen = file;
  try {
    if (groupName.input.value.trim() !== state?.groupName) {
      await request({ type: 'RENAME_GROUP', name: groupName.input.value });
    }
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    preview = await request<ImportPreview>({
      type: 'PREVIEW_IMPORT',
      bytes: Array.from(bytes),
      rule: target.input.value,
      mode,
    });
    bytes.fill(0);
    showPreview();
  } catch (error) {
    invalidatePreview();
    message(
      importError,
      error instanceof Error ? error.message : 'Could not validate this file.',
      true,
    );
  } finally {
    busy = false;
    setBusy(false);
    if (preview && activeTab === 'import')
      previewBox.querySelector<HTMLButtonElement>('.primary')?.focus();
  }
}
function showPreview() {
  if (!preview) return;
  const p = preview;
  step.textContent = 'Step 2 of 2';
  importSetup.hidden = true;
  verify.hidden = true;
  fileInfo.textContent = `${((file?.size ?? 0) / 1024).toFixed(1)} KiB · ${p.valid} valid rows`;
  previewBox.replaceChildren(
    el('h2', '', `Review import into ${state?.groupName ?? 'this group'}`),
    el('p', 'wrap', file?.name ?? 'Account CSV'),
    el('p', 'mono wrap', p.rule),
    el(
      'p',
      'subtle',
      p.mode === 'replace'
        ? 'Wipe & Replace · Accounts missing from valid incoming rows will be removed.'
        : 'Merge & Update · Existing accounts absent from this file are preserved.',
    ),
  );
  const counts = el('div', 'import-counts');
  for (const [label, value] of [
    ['Found', p.found],
    ['Valid', p.valid],
    ['Invalid', p.invalid],
    ['Added', p.added],
    ['Updated', p.updated],
    ['Removed', p.removed],
    ['Unchanged', p.unchanged],
  ]) {
    const n = el('div');
    n.append(el('strong', '', String(value)), el('span', 'subtle', String(label)));
    counts.append(n);
  }
  previewBox.append(counts);
  if (p.invalid)
    previewBox.append(
      el(
        'p',
        'notice warning',
        `${p.invalid} invalid rows will be excluded.${p.mode === 'replace' ? ' In Replace mode, existing IDs absent from the valid rows will be removed.' : ''}`,
      ),
    );
  if (p.diagnostics.length) {
    const details = el('details');
    details.append(el('summary', '', `Row diagnostics (${p.diagnostics.length})`));
    const codes = el('ul', 'diagnostics');
    p.diagnostics.forEach((d) => codes.append(el('li', 'mono', `Row ${d.row}: ${d.code}`)));
    details.append(codes);
    previewBox.append(details);
  }
  const importAction = button(`Import ${p.valid} valid accounts`, () => commit(p.token), 'primary');
  const reviewActions = el('div', 'actions review-actions');
  reviewActions.append(
    button('Edit import', () => invalidatePreview()),
    button('Cancel review', () => {
      invalidatePreview();
      message(importError, 'Import cancelled. Your stored accounts are unchanged.');
    }),
  );
  previewBox.append(importAction, reviewActions);
  content.scrollTop = 0;
}
async function commit(token: string) {
  let imported = false;
  await mutate(async () => {
    // This review is being consumed by our own commit, not invalidated by another view.
    invalidatePreview();
    await request({ type: 'COMMIT_IMPORT', token });
    imported = true;
    file = undefined;
    fileInput.value = '';
    fileName.textContent = 'Choose an account CSV';
    change.textContent = 'Choose file';
    invalidatePreview();
    message(importError, '');
    message(
      status,
      'Accounts imported. Review and save the login fields for this URL before autofill.',
    );
  }, 'Importing encrypted accounts…');
  if (imported) {
    if (!login.input.value && state?.rules.length) login.input.value = state.rules.join(', ');
    selectTab('profile', true);
  }
}
function setBusy(value: boolean) {
  app
    .querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
      'button,input,select',
    )
    .forEach((n) => {
      if (value) {
        n.dataset.wasDisabled = String(n.disabled);
        n.disabled = true;
      } else {
        n.disabled = n.dataset.wasDisabled === 'true';
        delete n.dataset.wasDisabled;
      }
    });
}
async function mutate(action: () => Promise<void>, pending = 'Saving your changes…') {
  if (busy) return;
  busy = true;
  setBusy(true);
  message(status, pending);
  try {
    await action();
    await refresh();
  } catch (error) {
    invalidatePreview();
    message(
      status,
      error instanceof Error ? error.message : 'The change could not be saved.',
      true,
    );
    await refresh();
  } finally {
    busy = false;
    setBusy(false);
  }
}
function updateAccounts() {
  if (!state || state.migrationRequired) return;
  const s = state;
  listHeading.replaceChildren(el('span', '', `Indexed accounts (${s.total})`));
  const purge = button(
    'Purge group',
    () =>
      confirmDialog(
        `Purge ${s.groupName ?? 'this group'}?`,
        `Permanently remove all ${s.total} accounts from “${s.groupName ?? 'this group'}”, including those outside this filter? Other CSV groups are untouched. This cannot be undone.`,
        'Purge this group',
        async () => {
          await request({ type: 'PURGE' });
          invalidatePreview();
          message(status, 'Accounts in this CSV group were removed.');
          await refresh();
        },
      ),
    'danger-small',
  );
  purge.disabled = !s.total || busy;
  const exportButton = button(
    'Export CSV',
    async () => {
      if (busy) return;
      busy = true;
      setBusy(true);
      let url: string | undefined;
      try {
        const csv = await request<string>({ type: 'EXPORT_CSV' });
        url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = el('a');
        link.href = url;
        link.download = `${(s.groupName ?? 'accounts').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'accounts'}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        message(
          status,
          `CSV download started for ${s.groupName ?? 'this group'} (${s.total} accounts).`,
        );
      } catch {
        message(status, 'Could not export this group. Try again.', true);
      } finally {
        if (url) {
          const downloadUrl = url;
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        }
        busy = false;
        setBusy(false);
      }
    },
    'secondary',
  );
  exportButton.disabled = !s.total || busy;
  exportButton.title =
    'Download all accounts in this group, including synthetic passwords and metadata.';
  const actions = el('div', 'actions');
  actions.append(exportButton, purge);
  listHeading.append(actions);
  list.replaceChildren();
  if (query) list.append(el('p', 'mono subtle', `${s.matches} matches of ${s.total} accounts`));
  let origin = '';
  try {
    origin = s.rules[0] ?? '';
  } catch {
    /* The worker validates all rules. */
  }
  if (!s.accounts.length)
    list.append(
      el(
        'div',
        'empty',
        s.total
          ? 'No matches. Try another search.'
          : 'No accounts indexed. Open Import CSV to begin.',
      ),
    );
  for (const account of s.accounts)
    list.append(
      accountRow(
        account,
        () =>
          mutate(async () => {
            await request({ type: 'DELETE', accountId: account.accountId });
            deletedId = account.accountId;
            invalidatePreview();
            message(status, `Deleted ${account.accountId}.`);
          }),
        true,
        origin,
      ),
    );
  if (s.matches > 50)
    list.append(
      pagination(s, (p) => {
        page = p;
        void refresh();
      }),
    );
  if (undoTimer) clearTimeout(undoTimer);
  const wasVisible = !undo.hidden;
  undo.hidden = !s.undoAvailable;
  undo.replaceChildren();
  if (s.undoAvailable) {
    undo.append(
      el('span', '', deletedId ? `Deleted ${deletedId}` : 'Account deleted'),
      button(
        'Undo',
        () =>
          mutate(async () => {
            await request({ type: 'UNDO' });
            message(status, 'Account restored. Previous login history was not restored.');
          }),
        'text-button',
      ),
    );
    if (s.undoExpiresAt)
      undoTimer = setTimeout(
        () => {
          undo.hidden = true;
          message(status, 'Undo no longer available. The 30-second recovery window ended.');
        },
        Math.max(0, s.undoExpiresAt - Date.now()),
      );
  } else if (wasVisible && !busy)
    message(status, 'Undo no longer available. The vault changed or the recovery window ended.');
}
function updatePresets() {
  presets.replaceChildren();
  const values = new Set(
    [...(state?.rules ?? []), ...(state?.profile?.logins ?? []).map((l) => l.origin)].filter(
      (v): v is string => !!v,
    ),
  );
  for (const value of values)
    presets.append(
      button(
        `+ ${value}`,
        () => {
          // Append rather than replace, so several environments can be built up.
          const current = target.input.value
            .split(/[\s,]+/u)
            .map((part) => part.trim())
            .filter(Boolean);
          if (!current.includes(value)) current.push(value);
          target.input.value = current.join(', ');
          invalidatePreview();
          updateChangeDomain();
        },
        'preset',
      ),
    );
}
profileForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  const profile: ProfileInput = {
    name: profileName.input.value,
    loginUrl: login.input.value,
    usernameMatch: usernameMatch.select.value as FieldMatch,
    passwordMatch: passwordMatch.select.value as FieldMatch,
    usernameSelector: usernameSelector.input.value,
    passwordSelector: passwordSelector.input.value,
    successKind: kind.value === 'element' ? 'element' : kind.value === 'url' ? 'url' : 'none',
    successUrl: successUrl.input.value,
    successSelector: successSelector.input.value,
  };
  const mismatch = catalogMismatch();
  if (mismatch) {
    message(profileStatus, mismatch, true);
    return;
  }
  let origins: string[];
  try {
    if (!state?.rules.length)
      throw new Error('Import accounts with an authorized URL rule before saving a profile.');
    validateProfile(
      profile,
      state.rules.map((r) => parseRule(r)),
      1,
      state.profile,
    );
    origins = parseDomainRules(profile.loginUrl).map((r) => {
      const url = new URL(r.origin);
      return `${url.protocol}//${url.hostname}/*`;
    });
  } catch (error) {
    message(
      profileStatus,
      error instanceof Error
        ? error.message
        : 'Review the profile fields before authorizing this website.',
      true,
    );
    return;
  }
  try {
    if (profile.usernameMatch === 'css') document.querySelectorAll(profile.usernameSelector);
    if (profile.passwordMatch === 'css') document.querySelectorAll(profile.passwordSelector);
    if (profile.successKind === 'element') document.querySelectorAll(profile.successSelector!);
  } catch {
    message(
      profileStatus,
      'A CSS selector is invalid. Review the username, password and success selectors.',
      true,
    );
    return;
  }
  // Keep the permission request directly in the user gesture, before any await.
  const permission = chrome.permissions.request({ origins });
  void mutate(async () => {
    if (!(await permission)) {
      message(
        profileStatus,
        'Website permission was denied. Save again to authorize this origin.',
        true,
      );
      return;
    }
    await request({ type: 'SAVE_PROFILE', profile });
    invalidatePreview();
    message(
      profileStatus,
      'Profile saved. Open a login form on the authorized domain and use the extension to fill an account.',
    );
    message(status, 'Website profile saved.');
  }, 'Requesting website permission…');
});
async function done() {
  if (sourceTab !== undefined) {
    try {
      await chrome.tabs.update(sourceTab, { active: true });
      const own = await chrome.tabs.getCurrent();
      if (own?.id !== undefined) {
        await chrome.tabs.remove(own.id);
        return;
      }
    } catch {
      /* Return to overview if original tab is no longer available. */
    }
  }
  location.hash = '';
  selectTab('import', true);
  window.scrollTo({ top: 0 });
}
function render() {
  if (!state) return;
  const s = state;
  badge.textContent = s.migrationRequired ? 'Migration needed' : `${s.total} accounts`;
  badge.className = s.migrationRequired ? 'pill' : 'pill authorized';
  groupBar.replaceChildren(
    groupPicker(
      s,
      () => {
        mounted = false;
        query = '';
        page = 0;
        file = undefined;
        fileInput.value = '';
        fileName.textContent = 'Choose an account CSV';
        invalidatePreview();
        void refresh();
      },
      () => busy,
    ),
  );
  footer.replaceChildren(versionFooter());
  if (s.migrationRequired) {
    tabs.hidden = true;
    mounted = false;
    file = undefined;
    fileInput.value = '';
    fileName.textContent = 'Choose an account CSV';
    change.textContent = 'Choose file';
    deletedId = '';
    query = '';
    page = 0;
    search.input.value = '';
    invalidatePreview();
    message(status, 'One-time migration required.');
    content.replaceChildren(migrationForm(refresh));
    if (s.initialized) content.append(resetButton(refresh));
    footer.append(el('span', 'subtle', 'Local synthetic accounts'));
    return;
  }
  tabs.hidden = false;
  if (!mounted) {
    groupName.input.value = s.groupName ?? 'Imported accounts';
    target.input.value = s.rules.join(', ');
    populateProfile();
    const security = el('details', 'settings-help local-settings');
    security.append(
      el('summary', '', 'Local data & reset'),
      el(
        'p',
        '',
        'Synthetic data only. Accounts stay on this device and open without a password. Local storage is not protected by a user password.',
      ),
    );
    const tools = el('div', 'actions');
    tools.append(resetButton(refresh));
    security.append(tools);
    content.replaceChildren(importPanel, accountsPanel, profilePanel, security);
    if (!tabButtons.get(activeTab)?.hasAttribute('aria-selected')) activeTab = tabFromHash();
    selectTab(activeTab);
    mounted = true;
  }
  // These follow the group's current rules, so they must refresh on every
  // render, not only on first mount.
  updatePresets();
  updateChangeDomain();
  updateAccounts();
  footer.append(
    el(
      'span',
      'mono subtle',
      `Local: ${(s.storageBytes / 1024 / 1024).toFixed(2)} MiB / 5 MiB limit`,
    ),
    button('Done', done, 'dark'),
  );
}
async function refresh() {
  const current = ++sequence;
  try {
    grantedOrigins = (await chrome.permissions.getAll()).origins ?? [];
  } catch {
    grantedOrigins = [];
  }
  try {
    const next = await request<AppState>({ type: 'STATE', query, page, tabId: sourceTab });
    if (current !== sequence) return;
    state = next;
    render();
  } catch (error) {
    message(status, error instanceof Error ? error.message : 'Could not load the vault.', true);
  }
}
chrome.runtime.onMessage.addListener((event: unknown) => {
  if (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    event.type === 'STATE_CHANGED'
  ) {
    if (preview && file) {
      invalidatePreview();
      message(importError, 'The vault changed. Verify this file again before importing.');
    }
    void refresh();
  }
});
void refresh();
