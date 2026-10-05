import type {
  AppState,
  ImportMode,
  ImportPreview,
  ProfileInput,
  Route,
  FieldMatch,
} from '../shared/types';
import { parseRule, validateProfile } from '../domain/rules';
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
  iconButton,
  liveRegion,
  message,
  pagination,
  request,
  resetButton,
  searchBox,
  sectionLabel,
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
title.append(
  el('strong', '', 'OneChat DEV Login Assistant'),
  el('p', 'subtle', 'Import & rule matching'),
);
brand.append(logo, title);
const badge = el('span', 'pill authorized');
const version = el('span', 'version mono', `v${chrome.runtime.getManifest().version}`);
headerLine.append(
  iconButton('back', 'Back to overview', () => {
    location.hash = '';
    window.scrollTo({ top: 0 });
  }),
  brand,
  version,
  badge,
);
header.append(headerLine);
const status = liveRegion(),
  content = el('div', 'options-body stack'),
  footer = el('footer', 'app-footer');
const groupBar = el('div', 'group-bar');
app.replaceChildren(header, groupBar, status, content, footer, versionFooter());
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
  deletedId = '';
const importPanel = el('section', 'import-panel panel stack');
importPanel.id = 'import';
const groupName = field('CSV group name');
groupName.input.maxLength = 80;
groupName.input.placeholder = 'QA Platform X';
const groupActions = el('div', 'actions');
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
const target = field('Authorized HTTPS domain *');
target.input.required = true;
target.input.placeholder = 'https://your-website.example';
target.input.autocomplete = 'off';
target.input.spellcheck = false;
const presets = el('div', 'presets');
const activeHint = el('p', 'subtle');
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
importPanel.append(
  importHeading,
  groupName.wrap,
  groupActions,
  fileCard,
  another,
  sample,
  target.wrap,
  el(
    'p',
    'subtle',
    'Enter the HTTPS domain, for example https://qa.example.com. Paths, queries and fragments are ignored. Subdomains and ports must match.',
  ),
  presets,
  activeHint,
  modeWrap,
  modeExplanation,
  importError,
  verify,
  previewBox,
);
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
slashSearch(search.input, () => !!state && !state.migrationRequired);
const profilePanel = el('details', 'panel profile-panel');
profilePanel.id = 'profile';
profilePanel.append(el('summary', '', 'Login profile & website permission'));
const profileForm = el('form', 'stack');
const profileName = field('Profile name'),
  login = field('Authorized HTTPS login domain', 'url'),
  usernameSelector = field('Username field CSS selector'),
  passwordSelector = field('Password field CSS selector'),
  successUrl = field('Exact HTTPS success / observation URL', 'url'),
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
  ['url', 'URL changes to success page'],
  ['element', 'A success element becomes visible'],
] as const) {
  const option = el('option', '', label);
  option.value = value;
  kind.append(option);
}
const kindLabel = el('label', 'field');
kindLabel.append(el('span', 'field-label', 'Successful login detection'), kind);
kind.addEventListener('change', () => {
  successSelector.wrap.hidden = kind.value !== 'element';
  successSelector.input.required = kind.value === 'element';
});
const profileStatus = liveRegion(),
  save = button('Save & authorize website', () => {}, 'primary');
save.type = 'submit';
profileForm.append(
  el(
    'p',
    'subtle',
    'One website profile. Import a CSV and URL rule first, then review and save these fields. Filling never submits the form.',
  ),
  profileName.wrap,
  login.wrap,
  usernameMatch.wrap,
  usernameSelector.wrap,
  passwordMatch.wrap,
  passwordSelector.wrap,
  el(
    'p',
    'subtle',
    'ID/name match exactly. Text labels and placeholders ignore case and extra spaces. Each method must resolve to one visible, writable input. CSS supports alternatives separated by commas, but must match exactly one input.',
  ),
  kindLabel,
  successUrl.wrap,
  successSelector.wrap,
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
  login.input.value = p ? p.login.origin : state?.rule ? new URL(state.rule).origin : '';
  usernameMatch.select.value = p?.usernameMatch ?? 'css';
  passwordMatch.select.value = p?.passwordMatch ?? 'css';
  usernameMatch.update();
  passwordMatch.update();
  usernameSelector.input.value = p?.usernameSelector ?? '';
  passwordSelector.input.value = p?.passwordSelector ?? '';
  kind.value = p?.success.kind ?? 'url';
  successUrl.input.value = p ? routeUrl(p.success.route) : '';
  successSelector.input.value = p?.success.kind === 'element' ? p.success.selector : '';
  successSelector.wrap.hidden = kind.value !== 'element';
  successSelector.input.required = kind.value === 'element';
}
function invalidatePreview() {
  preview = undefined;
  message(importError, '');
  previewBox.replaceChildren();
  step.textContent = 'Step 1 of 2';
  verify.hidden = false;
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
    message(importError, 'Enter the HTTPS URL to match.', true);
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
  }
}
function showPreview() {
  if (!preview) return;
  const p = preview;
  step.textContent = 'Step 2 of 2';
  verify.hidden = true;
  fileInfo.textContent = `${((file?.size ?? 0) / 1024).toFixed(1)} KiB · ${p.valid} valid rows`;
  previewBox.replaceChildren(
    el('h2', '', `Review import into ${state?.groupName ?? 'this group'}`),
    el('p', 'mono wrap', p.rule),
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
  previewBox.append(
    button(`Import ${p.valid} valid accounts`, () => commit(p.token), 'primary'),
    button('Cancel review', () => {
      invalidatePreview();
      message(importError, 'Import cancelled. Your stored accounts are unchanged.');
    }),
  );
}
async function commit(token: string) {
  await mutate(async () => {
    // This review is being consumed by our own commit, not invalidated by another view.
    invalidatePreview();
    await request({ type: 'COMMIT_IMPORT', token });
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
    profilePanel.open = true;
  }, 'Importing encrypted accounts…');
}
function setBusy(value: boolean) {
  content
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
    origin = s.rule ? new URL(s.rule).origin : '';
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
          : 'No accounts indexed. Import a CSV above to begin.',
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
async function activeSource() {
  try {
    if (sourceTab === undefined) throw new Error();
    const tab = await chrome.tabs.get(sourceTab);
    if (!tab.url) throw new Error();
    const url = new URL(tab.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    return undefined;
  }
}
function updatePresets() {
  presets.replaceChildren();
  const values = new Set(
    [state?.rule, state?.profile?.login.origin].filter((v): v is string => !!v),
  );
  for (const value of values)
    presets.append(
      button(
        `+ ${value}`,
        () => {
          target.input.value = value;
          invalidatePreview();
        },
        'preset',
      ),
    );
  const active = button(
    '+ Active Tab',
    async () => {
      const url = await activeSource();
      if (url) {
        target.input.value = url;
        invalidatePreview();
        activeHint.textContent = 'URL suggested for review. No permission has been granted.';
      } else {
        active.disabled = true;
        activeHint.textContent =
          'Open settings from the extension on the target website, or enter the URL.';
      }
    },
    'preset accent',
  );
  active.disabled = sourceTab === undefined;
  presets.append(active);
  activeHint.textContent =
    sourceTab === undefined
      ? 'Open settings from the extension on the target website, or enter the URL.'
      : '';
  void activeSource().then((url) => {
    if (!url) {
      active.disabled = true;
      activeHint.textContent =
        'Open settings from the extension on the target website, or enter the URL.';
    }
  });
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
    successKind: kind.value === 'element' ? 'element' : 'url',
    successUrl: successUrl.input.value,
    successSelector: successSelector.input.value,
  };
  let url: URL;
  try {
    if (!state?.rule)
      throw new Error('Import accounts with an authorized URL rule before saving a profile.');
    validateProfile(profile, parseRule(state.rule), 1, state.profile);
    url = new URL(profile.loginUrl);
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
  const permission = chrome.permissions.request({ origins: [`https://${url.hostname}/*`] });
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
  profilePanel.open = false;
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
  footer.replaceChildren();
  if (s.migrationRequired) {
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
  if (!mounted) {
    groupName.input.value = s.groupName ?? 'Imported accounts';
    target.input.value = s.rule ?? '';
    populateProfile();
    const security = el('div', 'notice encryption');
    security.append(
      icon('shield'),
      el(
        'p',
        '',
        'Synthetic data only. Accounts stay on this device and open without a password. Local storage is not protected by a user password.',
      ),
    );
    const tools = el('div', 'actions');
    tools.append(resetButton(refresh));
    content.replaceChildren(importPanel, accountsPanel, profilePanel, security, tools);
    mounted = true;
    profilePanel.open = location.hash === '#profile';
    if (location.hash === '#profile') profilePanel.scrollIntoView();
    updatePresets();
  }
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
