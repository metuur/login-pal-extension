import { chromium } from 'playwright';
import { createServer } from 'node:https';
import { mkdtemp, readFile, writeFile, cp, rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir, platform, arch, cpus } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'account-login-assistant-acceptance-'));
let context, server;
const results = [],
  errors = [],
  requests = [];
const check = (condition, label) => {
  assert.ok(condition, label);
  results.push(label);
};
const fixture = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Local synthetic login</title></head><body><h1>QA fixture</h1><form id="form"><label>Username<input id="username" type="email"></label><label>Password<input id="password" type="password" autocomplete="current-password"></label><button id="login">Login</button><p id="error"></p></form><script>document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const flow=new URL(location.href).searchParams.get('flow');if(flow==='fail'){document.querySelector('#error').textContent='Authentication rejected';return;}if(flow==='element'){const marker=document.createElement('div');marker.id='logged-in-user';marker.textContent='Authenticated fixture';document.body.append(marker);return;}if(flow==='spa'){history.pushState({},'', '/dashboard');document.body.textContent='Authenticated fixture';return;}location.href='/dashboard';});</script></body></html>`;
try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(temp, 'key.pem'),
      '-out',
      join(temp, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ],
    { stdio: 'ignore' },
  );
  server = createServer(
    { key: await readFile(join(temp, 'key.pem')), cert: await readFile(join(temp, 'cert.pem')) },
    (req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(
        req.url?.startsWith('/dashboard')
          ? '<!doctype html><title>Dashboard</title><h1 id="logged-in-user">Authenticated fixture</h1>'
          : req.url?.startsWith('/framed')
            ? '<!doctype html><title>Framed login</title><iframe src="/login" style="width:300px;height:200px"></iframe>'
            : req.url?.startsWith('/shadow')
              ? '<!doctype html><title>Shadow login</title><div id="host"></div><script>document.querySelector("#host").attachShadow({mode:"open"}).innerHTML=\'<input id="username" autocomplete="username"><input id="password" type="password">\';</script>'
              : fixture,
      );
    },
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `https://localhost:${server.address().port}`;
  const extension = join(temp, 'extension');
  await cp(resolve('dist'), extension, { recursive: true });
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
  check(manifest.version === packageInfo.version, 'Generated manifest uses the package version');
  check(
    ['Login Pal', 'Login Pal DEV'].includes(manifest.name) &&
      manifest.action.default_title === manifest.name,
    'Extension name and toolbar tooltip identify the same build',
  );
  const devBuild = manifest.name === 'Login Pal DEV';
  check(
    [16, 32, 48, 128].every(
      (size) =>
        manifest.icons[size] === `icon-${devBuild ? 'dev-' : ''}${size}.png` &&
        manifest.action.default_icon[size] === manifest.icons[size],
    ),
    'Extension and toolbar select purple DEV icons only for development builds',
  );
  check(
    !manifest.host_permissions &&
      manifest.optional_host_permissions?.join(' ') === 'https://*/* http://*/*',
    'Shipping manifest has optional host access only, over http and https',
  );
  // Headless Chrome cannot approve the host dialog. Grant only the controlled
  // localhost fixture in this disposable copy; production permissions are unchanged.
  // Two origins served by the same fixture stand in for prod and staging.
  manifest.host_permissions = ['https://localhost/*', 'https://127.0.0.1/*'];
  await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(join(temp, 'profile'), {
    channel: 'chromium',
    headless: true,
    ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.on('request', (request) => requests.push(request.url()));
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = worker.url().split('/')[2],
    base = `chrome-extension://${id}/`;
  const options = await context.newPage();
  options.on('pageerror', (e) => errors.push(e.message));
  await options.goto(base + 'options.html');
  const popup = await context.newPage();
  popup.on('pageerror', (e) => errors.push(e.message));
  await popup.goto(base + 'popup.html');
  for (const page of [popup, options]) {
    check(
      (await page.locator('.brand strong').innerText()) === manifest.name &&
        (await page.title()) ===
          (page === popup ? manifest.name : `Manage accounts · ${manifest.name}`),
      `${page === popup ? 'Popup' : 'Settings'} heading and document title match the build name`,
    );
    const credit = page.locator('.version-footer');
    await credit.waitFor();
    const text = await credit.innerText();
    check(
      text.includes(`v${packageInfo.version}`) && text.includes('Crafted by metuur'),
      `${page === popup ? 'Popup' : 'Settings'} footer shows the installed version and credit`,
    );
  }
  const send = async (command, page = options) => {
    const response = await page.evaluate((c) => chrome.runtime.sendMessage(c), command);
    assert.ok(response?.ok, `${command.type} should succeed: ${response?.error ?? 'no reply'}`);
    return response.data;
  };
  const reject = async (command, label, page = options) => {
    const response = await page.evaluate((c) => chrome.runtime.sendMessage(c), command);
    check(response?.ok === false, label);
  };
  const state = () => send({ type: 'STATE' });
  const fillWithGroup = async (accountId, targetTabId = tabId, groupId = 'default') => {
    await send({ type: 'CHOOSE_GROUP', groupId, tabId: targetTabId }, popup);
    return send({ type: 'FILL', accountId, tabId: targetTabId, groupId }, popup);
  };
  check(
    (await state()).initialized && !(await state()).migrationRequired,
    'New installation opens directly without password setup',
  );
  await options.getByRole('button', { name: 'Verify accounts', exact: true }).waitFor();
  const settingsTab = (name) => options.getByRole('tab', { name, exact: true });
  check(
    (await options.getByRole('tabpanel').count()) === 1 &&
      (await settingsTab('Import CSV').getAttribute('aria-selected')) === 'true',
    'Settings starts with only the import panel visible',
  );
  await settingsTab('Import CSV').focus();
  await options.keyboard.press('ArrowRight');
  check(
    (await settingsTab('Indexed accounts').getAttribute('aria-selected')) === 'true' &&
      (await options.getByRole('searchbox', { name: 'Search accounts' }).isVisible()),
    'Arrow navigation activates the indexed accounts tab',
  );
  await options.keyboard.press('End');
  const defaultUsernameSelector = await options
    .getByLabel('Username field CSS selector', { exact: true })
    .inputValue();
  const defaultPasswordSelector = await options
    .getByLabel('Password field CSS selector', { exact: true })
    .inputValue();
  check(
    !!defaultUsernameSelector && !!defaultPasswordSelector,
    'New login profiles contain actual default selectors, not just placeholders',
  );
  await options.getByLabel('Username field CSS selector', { exact: true }).fill('#custom-login');
  await options
    .getByRole('combobox', { name: 'Password match method', exact: true })
    .selectOption('id');
  await options.getByLabel('Password match value', { exact: true }).fill('custom-password');
  await options.getByRole('button', { name: 'Use common selectors', exact: true }).click();
  check(
    (await options
      .getByRole('combobox', { name: 'Password match method', exact: true })
      .inputValue()) === 'css' &&
      (await options.getByLabel('Username field CSS selector', { exact: true }).inputValue()) ===
        defaultUsernameSelector &&
      (await options.getByLabel('Password field CSS selector', { exact: true }).inputValue()) ===
        defaultPasswordSelector &&
      !(await state()).profile,
    'Restoring common selectors updates only the draft until explicitly saved',
  );
  await options.getByLabel('Profile name', { exact: true }).fill('Unfinished profile');
  await settingsTab('Login page setup').focus();
  await options.keyboard.press('Home');
  await settingsTab('Login page setup').click();
  check(
    (await options.getByLabel('Profile name', { exact: true }).inputValue()) ===
      'Unfinished profile',
    'Switching tabs preserves unfinished profile edits',
  );
  await options.getByLabel('Profile name', { exact: true }).fill('');
  await settingsTab('Import CSV').click();
  check(
    (await options.locator('input[type="password"]').count()) === 0,
    'Fresh settings has no master-password inputs',
  );
  check(
    (await popup.getByRole('button', { name: 'Lock', exact: true }).count()) === 0,
    'Popup has no lock action',
  );
  const csv =
    'account_id,username,password,customer_name,account_type,environment\nACC-1234,john@example.test,synthetic-only-one,Acme Corp,Premium,QA\nACC-5678,maria@example.test,synthetic-only-two,Contoso Global,Basic,QA\nACC-9042,qa@example.test,synthetic-only-three,Test Customer,Admin,QA';
  const bytes = [...new TextEncoder().encode(csv)];
  const preview = await send({
    type: 'PREVIEW_IMPORT',
    bytes,
    rule: origin + '/*',
    mode: 'merge',
    format: 'csv',
  });
  check(
    preview.valid === 3 && preview.added === 3,
    'CSV preview validates accounts without committing',
  );
  check((await state()).total === 0, 'Preview leaves the vault unchanged');
  await send({ type: 'COMMIT_IMPORT', token: preview.token });
  check((await state()).total === 3, 'Confirmed import commits the dataset');
  check(
    (await send({ type: 'STATE', query: 'premium acme' })).matches === 1,
    'Search matches terms across metadata',
  );
  check(
    (await send({ type: 'STATE', query: 'synthetic-only-one' })).matches === 0,
    'Password values are excluded from search',
  );
  await reject(
    { type: 'PREVIEW_IMPORT', bytes, rule: 'https://*.localhost/*', mode: 'merge', format: 'csv' },
    'Wildcard hosts are rejected',
  );
  const profile = {
    name: 'QA Portal',
    loginUrl: origin + '/login',
    usernameSelector: defaultUsernameSelector,
    passwordSelector: defaultPasswordSelector,
    successKind: 'url',
    successUrl: origin + '/dashboard',
  };
  await settingsTab('Login page setup').click();
  await options.getByLabel('Profile name', { exact: true }).fill(profile.name);
  await options.getByLabel('Authorized login domain', { exact: true }).fill(profile.loginUrl);
  await options
    .getByRole('combobox', { name: 'Success detection', exact: true })
    .selectOption('url');
  await options
    .getByLabel('Exact success URL (after login)', { exact: true })
    .fill(profile.successUrl);
  await options
    .getByRole('combobox', { name: 'Success detection', exact: true })
    .selectOption('none');
  check(
    await options.getByLabel('Exact success URL (after login)', { exact: true }).isHidden(),
    'Turning off success tracking hides its URL field instead of requiring one',
  );
  await options
    .getByRole('combobox', { name: 'Success detection', exact: true })
    .selectOption('element');
  check(
    (await options.getByLabel('Observation URL (page to watch)', { exact: true }).count()) === 1,
    'Success detection relabels its URL field for element mode',
  );
  await options
    .getByRole('combobox', { name: 'Success detection', exact: true })
    .selectOption('url');
  check(
    (await options.getByLabel('Exact success URL (after login)', { exact: true }).count()) === 1,
    'Success detection relabels its URL field back for URL mode',
  );
  await options.getByLabel(`Recognize this application on ${origin}`, { exact: false }).check();
  await options.getByLabel(`Page title for ${origin}`, { exact: true }).fill('Local synthetic');
  check(
    (await options
      .getByRole('combobox', { name: `Title matching mode for ${origin}` })
      .inputValue()) === 'contains',
    'Application recognition defaults to literal title containment',
  );
  await options.getByRole('button', { name: 'Save & authorize website', exact: true }).click();
  await options.getByText('Website profile saved.', { exact: true }).waitFor();
  check(
    (await state()).profile.usernameSelector === defaultUsernameSelector &&
      (await state()).profile.passwordSelector === defaultPasswordSelector,
    'The profile can be saved with prefilled selectors without manually entering CSS',
  );
  const site = await context.newPage();
  await site.goto(origin + '/login');
  const tabId = await options.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url)?.id,
    origin + '/login',
  );
  check(Number.isInteger(tabId), 'Authorized fixture tab is identifiable');
  await site.bringToFront();
  await popup.evaluate(() => chrome.storage.session.remove('popup-open-details'));
  await popup.goto(`${base}popup.html?sourceTab=${tabId}`);
  await popup.getByRole('searchbox', { name: 'Search accounts', exact: true }).fill('ACC-1234');
  const identityRow = popup.locator('#results .account-row').first();
  await identityRow.waitFor();
  check(
    (await identityRow.innerText()).includes('Group · Imported accounts'),
    'A uniquely matched group labels its account rows',
  );
  check(
    !(await identityRow.locator('details.metadata').evaluate((details) => details.open)) &&
      !(await popup.getByText('Page title', { exact: true }).isVisible()),
    'Title evidence stays out of collapsed account rows',
  );
  await identityRow.locator('details.metadata > summary').click();
  check(
    (await identityRow.innerText()).includes('Local synthetic login') &&
      (await identityRow.innerText()).includes('Matched'),
    'Account details disclose the current page title and match state',
  );
  const identitySettings = await context.newPage();
  await identitySettings.goto(`${base}options.html?sourceTab=${tabId}`);
  await identitySettings.getByRole('tab', { name: 'Indexed accounts', exact: true }).click();
  const settingsIdentityRow = identitySettings
    .locator('.account-row')
    .filter({ hasText: 'ACC-1234' })
    .first();
  await settingsIdentityRow.waitFor();
  await settingsIdentityRow.locator('details.metadata > summary').click();
  check(
    (await settingsIdentityRow.innerText()).includes('Local synthetic login') &&
      (await settingsIdentityRow.innerText()).includes('Matched'),
    'Settings Account details disclose the current title and match state',
  );
  await identitySettings.close();
  await fillWithGroup('ACC-1234');
  check(
    (await site.locator('#username').inputValue()) === 'john@example.test',
    'Autofill fills the intended username',
  );
  check(
    await site.locator('#password').evaluate((e) => e.value.length > 0),
    'Autofill fills a masked password field',
  );
  check(new URL(site.url()).pathname === '/login', 'Autofill does not submit the form');
  check((await state()).lastSuccessful === null, 'Filling alone does not mark success');
  await site.locator('#login').click();
  await site.waitForURL('**/dashboard');
  const waitState = async (predicate, label) => {
    for (let i = 0; i < 40; i++) {
      const s = await state();
      if (predicate(s)) {
        check(true, label);
        return s;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(label);
  };
  await waitState(
    (s) => s.lastSuccessful?.accountId === 'ACC-1234',
    'Full navigation records observed successful account',
  );
  await site.goto(origin + '/login?flow=fail');
  await site.bringToFront();
  await fillWithGroup('ACC-5678');
  await site.locator('#login').click();
  check(
    (await state()).lastSuccessful?.accountId === 'ACC-1234',
    'Failed login preserves previous successful account',
  );
  await site.goto(origin + '/unrelated');
  await site.bringToFront();
  await fillWithGroup('ACC-5678');
  check(
    (await site.locator('#username').inputValue()) === 'maria@example.test',
    'Autofill accepts another path on the authorized domain',
  );
  await site.goto(origin + '/login?flow=spa');
  await site.bringToFront();
  await fillWithGroup('ACC-5678');
  await site.locator('#login').click();
  await waitState(
    (s) => s.lastSuccessful?.accountId === 'ACC-5678',
    'SPA navigation records observed success',
  );
  await site.goto(origin + '/login');
  await site.bringToFront();
  await fillWithGroup('ACC-1234');
  const cdp = await context.newCDPSession(options);
  const targets = await cdp.send('Target.getTargets');
  const workerTarget = targets.targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.startsWith(base),
  );
  assert.ok(workerTarget, 'Extension service worker target exists');
  await cdp.send('Target.closeTarget', { targetId: workerTarget.targetId });
  await site.locator('#login').click();
  await waitState(
    (s) => s.lastSuccessful?.accountId === 'ACC-1234',
    'Worker termination preserves catalog session and pending login attribution',
  );
  await cdp.detach();
  await send({
    type: 'SAVE_PROFILE',
    profile: {
      ...profile,
      successKind: 'element',
      successUrl: origin + '/login',
      successSelector: '#logged-in-user',
    },
  });
  await site.goto(origin + '/login?flow=element');
  await site.bringToFront();
  await fillWithGroup('ACC-9042');
  await site.locator('#login').click();
  await waitState(
    (s) => s.lastSuccessful?.accountId === 'ACC-9042',
    'Visible configured element records observed success',
  );
  await reject(
    { type: 'FILL', accountId: 'ACC-1234', tabId },
    'Already true success condition refuses attribution',
    popup,
  );
  await send({ type: 'DELETE', accountId: 'ACC-9042' });
  check(
    (await state()).total === 2 && (await state()).lastSuccessful === null,
    'Deletion prunes account and successful history',
  );
  await send({ type: 'UNDO' });
  check(
    (await state()).total === 3 && (await state()).lastSuccessful === null,
    'Undo restores account without old success history',
  );
  const updated = csv.replace('Premium', 'Enterprise').split('\n').slice(0, 2).join('\n');
  const merge = await send({
    type: 'PREVIEW_IMPORT',
    bytes: [...new TextEncoder().encode(updated)],
    rule: origin + '/*',
    mode: 'merge',
    format: 'csv',
  });
  check(merge.updated === 1 && merge.removed === 0, 'Merge preview preserves omitted records');
  await send({ type: 'COMMIT_IMPORT', token: merge.token });
  check((await state()).total === 3, 'Merge preserves omitted records after commit');
  const storageSafe = await options.evaluate(async () => {
    const data = await chrome.storage.local.get(null),
      serialized = JSON.stringify(data);
    return (
      !serialized.includes('synthetic-only-') &&
      !serialized.includes('john@example.test') &&
      !serialized.includes('synthetic master phrase')
    );
  });
  check(storageSafe, 'Persistent storage contains no imported plaintext or master password');
  await send({ type: 'SAVE_PROFILE', profile });
  await site.goto(origin + '/login');
  await site.bringToFront();
  await fillWithGroup('ACC-1234');
  await site.locator('#login').click();
  await waitState(
    (s) => s.lastSuccessful?.accountId === 'ACC-1234',
    'Featured account is ready for visual inspection',
  );
  await mkdir('artifacts', { recursive: true });
  await site.goto(origin + '/login');
  await site.bringToFront();
  await popup.reload();
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.screenshot({ path: 'artifacts/popup.png' });
  await options.reload();
  await options.setViewportSize({ width: 430, height: 1050 });
  await options
    .locator('#csv-file')
    .setInputFiles({ name: 'accounts_qa_v2.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await options.getByRole('button', { name: 'Verify accounts', exact: true }).click();
  await options.getByRole('button', { name: 'Import 3 valid accounts', exact: true }).waitFor();
  check(
    await options
      .getByRole('button', { name: 'Import 3 valid accounts', exact: true })
      .evaluate((node) => node === document.activeElement),
    'Verification moves keyboard focus into the visible review',
  );
  await options.getByRole('button', { name: 'Cancel review', exact: true }).click();
  check(
    (await state()).total === 3 &&
      (await options.getByRole('button', { name: 'Verify accounts', exact: true }).isVisible()),
    'Cancelling review returns to setup without changing stored accounts',
  );
  await options.getByRole('button', { name: 'Verify accounts', exact: true }).click();
  await options.getByRole('button', { name: 'Import 3 valid accounts', exact: true }).waitFor();
  check(
    !(await options.getByLabel('CSV group name', { exact: true }).isVisible()) &&
      (await options.getByRole('tabpanel').count()) === 1,
    'Import review replaces setup instead of extending the settings page',
  );
  await settingsTab('Indexed accounts').click();
  await settingsTab('Import CSV').click();
  check(
    await options.getByRole('button', { name: 'Import 3 valid accounts', exact: true }).isVisible(),
    'A verified import survives tab navigation',
  );
  await send({ type: 'RENAME_GROUP', name: 'Imported accounts' });
  await options
    .getByText('The vault changed. Verify this file again before importing.', { exact: true })
    .waitFor();
  check(
    await options.getByRole('button', { name: 'Verify accounts', exact: true }).isVisible(),
    'An external catalog change returns stale review to import setup',
  );
  await options.getByRole('button', { name: 'Verify accounts', exact: true }).click();
  await options.getByRole('button', { name: 'Import 3 valid accounts', exact: true }).waitFor();
  await options.getByRole('button', { name: 'Edit import', exact: true }).click();
  check(
    (await options.locator('#csv-file').evaluate((node) => node.files.length)) === 1,
    'Editing a review retains the selected CSV',
  );
  await options.getByRole('button', { name: 'Verify accounts', exact: true }).click();
  await options.getByRole('button', { name: 'Import 3 valid accounts', exact: true }).waitFor();
  await options.screenshot({ path: 'artifacts/settings-review.png', fullPage: true });
  check((await state()).total === 3, 'Settings file selection and review do not silently commit');
  await options.getByRole('button', { name: 'Import 3 valid accounts', exact: true }).click();
  await waitState(
    (s) => s.total === 3 && s.accounts.some((a) => a.metadata.account_type === 'Premium'),
    'Settings import action commits verified account changes',
  );
  await settingsTab('Login page setup').waitFor();
  check(
    (await settingsTab('Login page setup').getAttribute('aria-selected')) === 'true',
    'Import completion opens website profile setup',
  );
  await settingsTab('Indexed accounts').click();
  await options.getByRole('button', { name: 'Delete ACC-9042', exact: true }).click();
  await options.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  check((await state()).total === 2, 'Settings delete action persists account removal');
  await options.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitState((s) => s.total === 3, 'Settings Undo action restores the deleted account');
  for (const width of [360, 430, 1000]) {
    await options.setViewportSize({ width, height: 800 });
    for (const name of ['Import CSV', 'Indexed accounts', 'Login page setup']) {
      await settingsTab(name).click();
      check(
        await options.evaluate(() => {
          const panel = document.querySelector('[role="tabpanel"]:not([hidden])');
          const body = document.querySelector('.options-body');
          return (
            document.documentElement.scrollWidth <= innerWidth &&
            body.scrollWidth <= body.clientWidth &&
            panel.scrollWidth <= panel.clientWidth &&
            document.querySelector('.settings-tabs').getBoundingClientRect().bottom < innerHeight
          );
        }),
        `${name} has no horizontal overflow and keeps navigation visible at ${width}px`,
      );
    }
  }
  await options.screenshot({ path: 'artifacts/settings-profile.png', fullPage: true });
  await settingsTab('Import CSV').click();
  await options.screenshot({ path: 'artifacts/settings-import.png', fullPage: true });
  await options.setViewportSize({ width: 430, height: 800 });
  await settingsTab('Indexed accounts').click();
  await options.screenshot({ path: 'artifacts/settings.png', fullPage: true });
  // Grant only read, so the copy buttons exercise the real write path rather
  // than a pre-authorized one. Read-back is the assertion mechanism.
  await context.grantPermissions(['clipboard-read']);
  const firstRow = options.locator('.account-row').first();
  await firstRow.locator('.metadata summary').click();
  check(
    (await firstRow.getByRole('button', { name: 'Copy username', exact: true }).count()) === 1 &&
      (await firstRow.getByRole('button', { name: 'Copy password', exact: true }).count()) === 1,
    'Account details offer separate copy actions for username and password',
  );
  const rowAccountId = await firstRow.locator('dd').first().innerText();
  const expected = Object.fromEntries(
    csv
      .split('\n')
      .slice(1)
      .map((line) => line.split(','))
      .map(([id, username, password]) => [id, { username, password }]),
  )[rowAccountId];
  await firstRow.getByRole('button', { name: 'Copy username', exact: true }).click();
  check(
    (await options.evaluate(() => navigator.clipboard.readText())) === expected.username,
    'Copy username places the account username on the clipboard',
  );
  await firstRow.getByRole('button', { name: 'Copy password', exact: true }).click();
  await firstRow.locator('.icon-button.copy-ok').first().waitFor();
  check(
    (await options.evaluate(() => navigator.clipboard.readText())) === expected.password,
    'Copy password places the account password on the clipboard',
  );
  check(
    (await firstRow.locator('.metadata .sr-only').innerText()).includes('copied to the clipboard'),
    'A successful copy is announced to assistive technology and marked with the success icon',
  );
  check(
    !(await options.locator('body').innerText()).includes(expected.password) &&
      !(await options.content()).includes(expected.password),
    'Copying a password never renders it in the settings document',
  );
  await options.screenshot({ path: 'artifacts/account-details.png', fullPage: true });
  check(
    await options.evaluate(() => {
      const dt = document.querySelector('.metadata dl dt');
      return (
        !!dt &&
        getComputedStyle(dt).overflowWrap === 'break-word' &&
        dt.getBoundingClientRect().height <= parseFloat(getComputedStyle(dt).lineHeight) * 1.5
      );
    }),
    'Account detail labels fit on one line instead of breaking mid-word',
  );
  check(
    (await popup.locator('body').innerText()).includes('Login Pal'),
    'Popup renders the branded interface',
  );
  check(
    (await popup.locator('.account-row').first().locator('.row-actions .icon-button').count()) ===
      1,
    'Each list row offers a details action beside the direct fill button',
  );
  await site.goto(origin + '/login');
  await site.bringToFront();
  await popup.bringToFront();
  await popup.locator('.account-row').first().locator('.select-button').click();
  await popup.waitForTimeout(1200);
  check(
    (await popup.locator('.confirm-heading').count()) === 0,
    'Fill it fills straight from the list instead of opening the confirm view',
  );
  const filled = popup.locator(
    '.account-row .select-button.fill-ok, .account-row .select-button.fill-fail',
  );
  await filled.first().waitFor();
  check(
    (await filled.first().locator('svg').count()) === 1 &&
      (await filled.first().innerText()).trim() === '',
    'The fill outcome is shown as an icon on the row button, not as a banner',
  );
  // popup.html is a tab in this harness, so focusing it deactivates the target
  // tab and fill() rejects. The credential write itself is covered by the
  // FILL command tests; here we only prove the button routes to a fill.
  check(
    (await popup.locator('.popup-body, #app').first().innerText()).includes('filling') ||
      (await popup.locator('[role="status"]').first().innerText()).length > 0,
    'Fill it reports a fill attempt rather than navigating to a confirm step',
  );
  await popup.locator('.account-row').first().locator('.row-actions .icon-button').click();
  await popup.locator('.confirm-heading').waitFor();
  check(
    (await popup
      .locator('.confirm-heading')
      .getByRole('button', { name: 'Copy username' })
      .count()) === 1 &&
      (await popup
        .locator('.confirm-heading')
        .getByRole('button', { name: 'Copy password' })
        .count()) === 1,
    'Confirm account view offers copy actions beside the account name',
  );
  await popup.locator('.confirm-heading').getByRole('button', { name: 'Copy password' }).click();
  await popup.locator('.confirm-heading .copy-ok').waitFor();
  check(
    !(await popup.content()).includes('synthetic-only-'),
    'The confirm view copy never renders a password',
  );
  await popup.getByRole('button', { name: '← Back to accounts', exact: true }).click();
  await site.bringToFront();
  await settingsTab('Import CSV').click();
  check(
    (await options.locator('body').innerText()).includes('Merge'),
    'Settings renders account import modes',
  );
  await settingsTab('Import CSV').click();
  check(
    await options.locator('.change-domain').isHidden(),
    'The change-domain offer stays hidden while the typed domain matches the group',
  );
  await options.getByLabel('Authorized domain *', { exact: true }).fill('https://other.example');
  check(
    !(await options.locator('.change-domain').isHidden()) &&
      (await options.locator('.change-domain button').innerText()).includes(
        'https://other.example',
      ),
    'Typing a different domain offers to re-point the group and names the target',
  );
  await options.getByLabel('Authorized domain *', { exact: true }).fill(origin);
  check(
    await options.locator('.change-domain').isHidden(),
    'Restoring the current domain withdraws the change-domain offer',
  );
  check(
    (await options.locator('.presets button').allInnerTexts()).some((t) => t.includes(origin)),
    'Every authorized domain of the group is offered as a chip',
  );
  await settingsTab('Login page setup').click();
  await options
    .getByRole('combobox', { name: 'Username match method', exact: true })
    .selectOption('label');
  await options.getByLabel('Username match value', { exact: true }).fill('Username');
  await options
    .getByRole('combobox', { name: 'Password match method', exact: true })
    .selectOption('autocomplete');
  await options.getByLabel('Password match value', { exact: true }).fill('current-password');
  // Success tracking is optional: a profile saved without it must still fill.
  await options
    .getByRole('combobox', { name: 'Success detection', exact: true })
    .selectOption('none');
  await options.getByRole('button', { name: 'Save & authorize website', exact: true }).click();
  await options.getByText('Website profile saved.', { exact: true }).waitFor();
  check(
    (await state()).profile.success === undefined,
    'A profile saves with no success condition at all',
  );
  await site.goto(origin + '/login');
  await fillWithGroup('ACC-1234');
  check(
    (await site.locator('#username').inputValue()) === 'john@example.test' &&
      (await site.locator('#password').inputValue()).length > 0,
    'Autofill works for a profile that does not track successful logins',
  );
  // One group, the same application on two environments, one set of selectors.
  const second = `https://127.0.0.1:${server.address().port}`;
  await send({ type: 'SET_CATALOG_RULE', rule: `${origin}, ${second}` });
  await send({
    type: 'SAVE_PROFILE',
    profile: { ...profile, loginUrl: `${origin}, ${second}`, successKind: 'none', successUrl: '' },
  });
  const twoEnv = await state();
  check(
    twoEnv.rules.length === 2 &&
      twoEnv.rules.includes(origin) &&
      twoEnv.rules.includes(second) &&
      twoEnv.profile.logins.length === 2,
    'One CSV group authorizes the same application on two environments',
  );
  check(
    twoEnv.profile.usernameSelector === profile.usernameSelector &&
      twoEnv.profile.passwordSelector === profile.passwordSelector,
    'Both environments share one set of field selectors',
  );
  const secondSite = await context.newPage();
  secondSite.on('pageerror', (e) => errors.push(e.message));
  await secondSite.goto(second + '/login');
  await secondSite.bringToFront();
  const secondTabId = await secondSite
    .evaluate(() => 0)
    .then(async () => {
      const tabs = await options.evaluate(() => chrome.tabs.query({}));
      return tabs.find((t) => t.url?.startsWith('https://127.0.0.1'))?.id;
    });
  await fillWithGroup('ACC-1234', secondTabId);
  check(
    (await secondSite.locator('#username').inputValue()) === 'john@example.test' &&
      (await secondSite.locator('#password').inputValue()).length > 0,
    'Autofill works on the second environment without a second profile',
  );
  await secondSite.close();
  await site.bringToFront();
  await send({ type: 'SET_CATALOG_RULE', rule: origin });
  // The form still holds both origins; narrow it back to match the group.
  await options.getByLabel('Authorized login domain', { exact: true }).fill(origin);
  await options
    .getByRole('combobox', { name: 'Success detection', exact: true })
    .selectOption('url');
  await options
    .getByLabel('Exact success URL (after login)', { exact: true })
    .fill(profile.successUrl);
  await options.getByRole('button', { name: 'Save & authorize website', exact: true }).click();
  // A concurrent refresh can overwrite the global banner, so assert the panel's own notice.
  await options.getByText('Profile saved.', { exact: false }).first().waitFor();
  await site.goto(origin + '/login');
  await fillWithGroup('ACC-1234');
  check(
    (await site.locator('#username').inputValue()) === 'john@example.test',
    'Label and autocomplete matching configured in Settings fills the browser form',
  );
  // A second tab on the same authorized origin proves the picker lists every
  // matching tab, most recently used first, not just one.
  const otherTab = await context.newPage();
  otherTab.on('pageerror', (e) => errors.push(e.message));
  await otherTab.goto(origin + '/dashboard');
  const detectPage = await context.newPage();
  detectPage.on('pageerror', (e) => errors.push(e.message));
  // Settings opens in its own tab with no sourceTab, exactly as it does when
  // reached from an already-open settings window rather than from the popup.
  await detectPage.goto(`${base}options.html#profile`);
  await detectPage.bringToFront();
  await detectPage
    .getByRole('button', { name: 'Detect fields from the login page', exact: true })
    .click();
  // One poll resolves as soon as the spinner exists, so the assertion cannot
  // race the spinner's removal once the lookup finishes.
  const spinning = await detectPage
    .waitForFunction(() => {
      const node = document.querySelector('button.loading .spinner');
      return node ? getComputedStyle(node).animationName : null;
    })
    .then((handle) => handle.jsonValue());
  check(spinning === 'spin', 'The detect action spins a loader on the button while it works');
  const tabChoice = detectPage.locator('.tab-choices button');
  await tabChoice.first().waitFor();
  const offered = await tabChoice.allInnerTexts();
  check(
    offered.length === 2 &&
      offered[0].includes('Dashboard') &&
      offered[1].includes('Local synthetic login'),
    'Detection offers every recently used tab on the authorized domain, newest first',
  );
  check(
    offered[1].includes('/login'),
    'Each offered tab names its path so same-titled pages stay distinguishable',
  );
  await otherTab.close();
  // A component-built form is only reachable through its open shadow root.
  const shadowTab = await context.newPage();
  shadowTab.on('pageerror', (e) => errors.push(e.message));
  await shadowTab.goto(origin + '/shadow');
  await detectPage.bringToFront();
  await detectPage
    .getByRole('button', { name: 'Detect fields from the login page', exact: true })
    .click();
  await detectPage.locator('.tab-choices button').filter({ hasText: 'Shadow login' }).click();
  await detectPage.getByRole('button', { name: 'id: username', exact: true }).waitFor();
  check(
    (await detectPage.getByRole('button', { name: 'id: password', exact: true }).count()) === 1,
    'Detection finds login fields a component places in an open shadow root',
  );
  check(
    (await detectPage.locator('#profile .notice.success').innerText()).startsWith(
      'Found 2 candidate fields',
    ),
    'Finding candidates reports success and counts them',
  );
  await shadowTab.close();
  // A framed login form is unreadable and unfillable, so say which frame.
  const framedTab = await context.newPage();
  framedTab.on('pageerror', (e) => errors.push(e.message));
  await framedTab.goto(origin + '/framed');
  await detectPage.bringToFront();
  await detectPage
    .getByRole('button', { name: 'Detect fields from the login page', exact: true })
    .click();
  await detectPage.locator('.tab-choices button').filter({ hasText: 'Framed login' }).click();
  const emptyNotice = detectPage.locator('#profile .notice.warning');
  await emptyNotice.waitFor();
  check(
    (await emptyNotice.innerText()).startsWith('No login fields found on that page'),
    'Finding no fields warns instead of reporting success or failing silently',
  );
  check(
    (await detectPage.locator('.detected').innerText()).includes('embedded frame (localhost)'),
    'An empty page names the embedded frame that hides its login form',
  );
  check(
    await detectPage.evaluate(() => {
      const chips = document.querySelector('.tab-choices');
      const notice = document.querySelector('#profile .notice.warning');
      const details = document.querySelector('.detected');
      const following = Node.DOCUMENT_POSITION_FOLLOWING;
      return (
        !!chips &&
        !!notice &&
        !!details &&
        chips.compareDocumentPosition(notice) === following &&
        notice.compareDocumentPosition(details) === following
      );
    }),
    'Detection feedback sits under the tab chips, not at the bottom of the panel',
  );
  await framedTab.close();
  await detectPage.bringToFront();
  await detectPage
    .getByRole('button', { name: 'Detect fields from the login page', exact: true })
    .click();
  await tabChoice.filter({ hasText: 'Local synthetic login' }).first().click();
  await detectPage.getByRole('button', { name: 'id: username', exact: true }).waitFor();
  check(
    (await detectPage.getByRole('button', { name: 'id: password', exact: true }).count()) === 1,
    'Field detection lists login page inputs by their most stable attribute',
  );
  check(
    !(await detectPage.locator('.detected').innerHTML()).includes('john@example.test') &&
      !(await detectPage.content()).includes('synthetic-only-'),
    'Field detection reports attributes without reporting any input value',
  );
  await detectPage.getByRole('button', { name: 'id: username', exact: true }).click();
  check(
    (await detectPage
      .getByRole('combobox', { name: 'Username match method', exact: true })
      .inputValue()) === 'id' &&
      (await detectPage.getByLabel('Username match value', { exact: true }).inputValue()) ===
        'username',
    'Choosing a detected candidate sets the matching method and value',
  );
  check(
    (await detectPage.evaluate(() => location.search)) === '',
    'Field detection works from a settings tab that was not opened from the login page',
  );
  // A domain added to the group after the profile was saved is not named in
  // this form, yet its tabs must still be listed, which needs its host grant.
  await send({ type: 'SET_CATALOG_RULE', rule: `${origin}, ${second}` });
  await detectPage.evaluate(() => {
    window.requestedOrigins = [];
    const granted = chrome.permissions.request;
    chrome.permissions.request = (options) => {
      window.requestedOrigins.push(...options.origins);
      return granted(options);
    };
  });
  await detectPage
    .getByRole('button', { name: 'Detect fields from the login page', exact: true })
    .click();
  await detectPage.locator('.tab-choices button').first().waitFor();
  const requested = await detectPage.evaluate(() => window.requestedOrigins);
  check(
    (await detectPage.getByLabel('Authorized login domain', { exact: true }).inputValue()) ===
      origin && requested.includes('https://127.0.0.1/*'),
    'Detection requests host access for every group domain, not only the ones in this form',
  );
  await send({ type: 'SET_CATALOG_RULE', rule: origin });
  // Chrome owns its prompt's wording, so the extension must explain the ask
  // itself. Report no grants to take the path a first-time domain takes.
  await detectPage.evaluate(() => {
    const real = chrome.permissions.getAll;
    window.grantsRead = 0;
    chrome.permissions.getAll = async () => {
      window.grantsRead++;
      return { origins: [], permissions: [] };
    };
    window.restoreGrants = () => {
      chrome.permissions.getAll = real;
    };
  });
  // Any vault change refreshes settings, which is when the page re-reads grants.
  await send({ type: 'RENAME_GROUP', name: 'Imported accounts' });
  await detectPage.waitForFunction(() => window.grantsRead > 0);
  await detectPage
    .getByRole('button', { name: 'Detect fields from the login page', exact: true })
    .click();
  const explainer = detectPage.locator('dialog.confirm-dialog');
  await explainer.waitFor();
  check(
    (await explainer.innerText()).includes('Chrome will ask for access to these sites') &&
      (await explainer.innerText()).includes('It never reads what you type'),
    'A missing grant is explained in the extension before Chrome shows its own prompt',
  );
  check(
    (await explainer.locator('button.primary').innerText()) === 'Continue',
    'The permission explanation offers a plain Continue, not a destructive action',
  );
  await explainer.getByRole('button', { name: 'Continue', exact: true }).click();
  await explainer.waitFor({ state: 'detached' });
  await detectPage.locator('.tab-choices button').first().waitFor();
  check(
    (await detectPage.locator('dialog.confirm-dialog').count()) === 0 &&
      (await detectPage.locator('.tab-choices button').count()) > 0,
    'Continuing from the explanation closes it and still lists the readable tabs',
  );
  await detectPage.evaluate(() => window.restoreGrants());
  await detectPage.close();
  // A refused autofill must name its cause; a generic failure leaves the user
  // with no way to tell a stale profile from a wrong tab.
  const fillError = async (command) => {
    const response = await popup.evaluate((c) => chrome.runtime.sendMessage(c), command);
    return response?.ok === false ? response.error : '';
  };
  await send({ type: 'SET_CATALOG_RULE', rule: `${origin}, ${second}` });
  check(
    (await fillError({ type: 'FILL', accountId: 'ACC-1234', tabId })).startsWith(
      "The group's domains changed",
    ),
    'Autofill names a profile left unapproved by a group domain change',
  );
  await send({
    type: 'SAVE_PROFILE',
    profile: { ...profile, successKind: 'none', successUrl: '' },
  });
  const otherEnv = await context.newPage();
  otherEnv.on('pageerror', (e) => errors.push(e.message));
  await otherEnv.goto(second + '/login');
  await otherEnv.bringToFront();
  const otherEnvId = await options.evaluate(async () => {
    const open = await chrome.tabs.query({});
    return open.find((t) => t.url?.startsWith('https://127.0.0.1'))?.id;
  });
  check(
    (await fillError({ type: 'FILL', accountId: 'ACC-1234', tabId: otherEnvId })).startsWith(
      'That tab is not on a login domain saved in this profile',
    ),
    'Autofill names a tab the group allows but this profile does not list',
  );
  await otherEnv.close();
  await site.bringToFront();
  await send({ type: 'SET_CATALOG_RULE', rule: origin });
  await send({
    type: 'SAVE_PROFILE',
    profile: { ...profile, successKind: 'none', successUrl: '' },
  });
  await site.locator('#username').fill('edited@example.test');
  await site.locator('#login').click();
  await settingsTab('Import CSV').click();
  await options.locator('.options-body').evaluate((node) => {
    node.scrollTop = 0;
  });
  const downloadEvent = options.waitForEvent('download');
  await options.getByRole('link', { name: 'Download sample CSV (3 rows)', exact: true }).click();
  const download = await downloadEvent;
  const samplePath = await download.path();
  const sampleCsv = await readFile(samplePath, 'utf8');
  check(
    sampleCsv.trim().split('\n').length === 4 &&
      sampleCsv.startsWith('account_id,username,password,'),
    'Sample download has required headers and three synthetic rows',
  );
  await options.getByLabel('CSV group name', { exact: true }).fill('Performance');
  await options.getByRole('button', { name: 'Create new group', exact: true }).click();
  await options
    .getByRole('combobox', { name: 'CSV group', exact: true })
    .selectOption({ label: 'Performance' });
  await options
    .getByText('Group created. Choose its CSV and authorized URL.', { exact: true })
    .waitFor();
  const groupId = await options
    .getByRole('combobox', { name: 'CSV group', exact: true })
    .inputValue();
  await options
    .getByLabel('Authorized domain *', { exact: true })
    .fill('https://performance.example.test/*');
  await options.locator('#csv-file').setInputFiles({
    name: 'performance.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'account_id,username,password\nACC-1234,performance@example.test,synthetic-perf',
    ),
  });
  await options.getByRole('button', { name: 'Verify accounts', exact: true }).click();
  await options.getByRole('button', { name: 'Import 1 valid accounts', exact: true }).click();
  await waitState((s) => s.total === 3, 'Creating another CSV group preserves the original group');
  const groupState = () => send({ type: 'STATE', groupId });
  for (let i = 0; i < 30 && (await groupState()).total !== 1; i++)
    await new Promise((r) => setTimeout(r, 100));
  check(
    (await groupState()).total === 1 &&
      (await groupState()).rules.join() === 'https://performance.example.test',
    'CSV group stores its own URL and duplicate account ID',
  );
  const chooserEvent = options.waitForEvent('filechooser');
  await settingsTab('Import CSV').click();
  await options.getByRole('button', { name: 'Upload another CSV', exact: true }).click();
  const chooser = await chooserEvent;
  const extraPath = join(temp, 'additional.csv');
  await writeFile(
    extraPath,
    'account_id,username,password\nPERF-2,extra@example.test,synthetic-extra',
  );
  await chooser.setFiles(extraPath);
  await options.getByRole('button', { name: 'Verify accounts', exact: true }).click();
  await options.getByRole('button', { name: 'Import 1 valid accounts', exact: true }).click();
  for (let i = 0; i < 30 && (await groupState()).total !== 2; i++)
    await new Promise((r) => setTimeout(r, 100));
  check((await groupState()).total === 2, 'Upload another CSV merges into the selected group');
  await settingsTab('Indexed accounts').click();
  await options.getByRole('searchbox', { name: 'Search accounts', exact: true }).fill('PERF-2');
  const exportEvent = options.waitForEvent('download');
  await options.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const groupDownload = await exportEvent;
  const exportedText = await readFile(await groupDownload.path(), 'utf8');
  const { default: Papa } = await import('papaparse');
  const exportedRows = Papa.parse(exportedText, { header: true, skipEmptyLines: true }).data;
  check(
    groupDownload.suggestedFilename() === 'Performance.csv' &&
      exportedRows.length === 2 &&
      exportedRows.every((row) => ['ACC-1234', 'PERF-2'].includes(row.account_id)),
    'Export downloads every account in the selected group, regardless of search filter',
  );
  check(
    exportedRows.every(
      (row) => typeof row.password === 'string' && row.password.startsWith('synthetic-'),
    ),
    'Export preserves synthetic password values for reimport',
  );
  await options.getByRole('searchbox', { name: 'Search accounts', exact: true }).fill('');

  await options.locator('.options-body').evaluate((node) => {
    node.scrollTop = 0;
  });
  await options.setViewportSize({ width: 430, height: 648 });
  await options.screenshot({ path: 'artifacts/group-settings.png', fullPage: true });
  await options.getByRole('button', { name: 'Purge group', exact: true }).click();
  check(
    (await options.getByRole('dialog').innerText()).includes('Performance'),
    'Purge confirmation names the selected CSV group',
  );
  await options.getByRole('button', { name: 'Purge this group', exact: true }).click();
  for (let i = 0; i < 30 && (await groupState()).total !== 0; i++)
    await new Promise((r) => setTimeout(r, 100));
  check(
    (await groupState()).total === 0 && (await state()).total === 3,
    'Group purge preserves accounts in other CSV groups',
  );
  await options.getByRole('combobox', { name: 'CSV group', exact: true }).selectOption('default');
  await settingsTab('Import CSV').click();
  await options.getByLabel('CSV group name', { exact: true }).fill('QA Platform X');
  await options.getByRole('button', { name: 'Save group name', exact: true }).click();
  await options.getByText('Group name saved.', { exact: true }).waitFor();
  await settingsTab('Indexed accounts').click();
  await options.getByRole('button', { name: 'Purge group', exact: true }).click();
  await options.getByRole('button', { name: 'Cancel', exact: true }).click();
  check((await state()).total === 3, 'Cancelling purge preserves the catalog');
  await options.getByRole('button', { name: 'Purge group', exact: true }).click();
  await options
    .getByRole('dialog')
    .getByRole('button', { name: 'Purge this group', exact: true })
    .click();
  await waitState(
    (s) => s.total === 0 && s.initialized,
    'Confirmed settings purge empties accounts while preserving vault setup',
  );
  const largeCsv =
    'account_id,username,password,customer_name,environment\n' +
    Array.from(
      { length: 10000 },
      (_, i) =>
        `PERF-${String(i).padStart(5, '0')},qa${i}@example.test,synthetic-perf,Customer ${i},QA`,
    ).join('\n');
  const largePreview = await send({
    type: 'PREVIEW_IMPORT',
    bytes: [...new TextEncoder().encode(largeCsv)],
    rule: origin + '/*',
    mode: 'replace',
    format: 'csv',
  });
  await send({ type: 'COMMIT_IMPORT', token: largePreview.token });
  await site.bringToFront();
  await popup.reload();
  await popup.getByRole('searchbox', { name: 'Search accounts', exact: true }).waitFor();
  const searchMs = await popup.evaluate(
    () =>
      new Promise((resolve) => {
        const input = document.querySelector('input[type="search"]');
        const start = performance.now();
        const observer = new MutationObserver(() => {
          const rows = document.querySelectorAll('#results .account-row');
          if (rows.length === 1 && rows[0].textContent.includes('PERF-09999')) {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        });
        observer.observe(document.querySelector('#app'), { subtree: true, childList: true });
        input.value = 'PERF-09999';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => {
          observer.disconnect();
          resolve(1000);
        }, 1000);
      }),
  );
  check(searchMs < 200, '10,000-account search renders within 200 ms after input');
  await send({ type: 'PURGE' });
  check(
    requests.every(
      (url) =>
        url.startsWith(base) ||
        url.startsWith(origin) ||
        // The staging stand-in is the same local fixture on a second origin.
        url.startsWith(second) ||
        url.startsWith('data:') ||
        url.startsWith(`blob:${base}`),
    ),
    'Extension UI loads no remote assets or application services',
  );
  check(errors.length === 0, 'Extension pages have no uncaught browser errors');
  // A Chrome action popup sizes its frame to the 380px content, so it is never
  // rendered narrower than that. Viewport-relative caps collapse the real popup.
  for (const width of [380, 420, 800]) {
    await popup.setViewportSize({ width, height: 600 });
    check(
      await popup.evaluate(
        () =>
          document.body.scrollWidth <= document.body.clientWidth &&
          document.body.clientWidth === 380,
      ),
      `Popup has no horizontal overflow at ${width}px`,
    );
  }
  await popup.setViewportSize({ width: 20, height: 20 });
  check(
    await popup.evaluate(
      () =>
        document.body.getBoundingClientRect().width === 380 &&
        document.querySelector('#app').getBoundingClientRect().height > 100,
    ),
    'Popup keeps its 380px frame and content height when the viewport reports a collapsed size',
  );
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  check(
    await popup.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'Popup supports the reduced-motion browser preference',
  );
  const browserVersion = context.browser()?.version();
  await context.close();
  // Restore the shipping permission model before reset: mandatory test-only
  // permissions cannot be revoked by chrome.permissions.remove.
  delete manifest.host_permissions;
  await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(join(temp, 'profile'), {
    channel: 'chromium',
    headless: true,
    ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const restartedOptions = await context.newPage();
  await restartedOptions.goto(base + 'options.html');
  const restartedState = await send({ type: 'STATE' }, restartedOptions);
  check(
    restartedState.initialized && !restartedState.migrationRequired,
    'Browser restart opens the catalog without a password',
  );
  const beforeRule = await send({ type: 'STATE' }, restartedOptions);
  await send({ type: 'SET_CATALOG_RULE', rule: 'https://elsewhere.example' }, restartedOptions);
  const afterRule = await send({ type: 'STATE' }, restartedOptions);
  check(
    beforeRule.rules.join() !== afterRule.rules.join() &&
      afterRule.rules.join() === 'https://elsewhere.example' &&
      afterRule.total === beforeRule.total,
    'A saved group can be re-pointed at another domain without re-importing its CSV',
  );
  check(
    !afterRule.authorized,
    'Changing the group domain leaves the saved profile unauthorized until it is saved again',
  );
  await reject(
    { type: 'SET_CATALOG_RULE', rule: 'https://elsewhere.example' },
    'Re-sending the same group domain is rejected',
    restartedOptions,
  );
  await send({ type: 'RESET' }, restartedOptions);
  check(
    (await send({ type: 'STATE' }, restartedOptions)).total === 0 &&
      !(await send({ type: 'STATE' }, restartedOptions)).migrationRequired,
    'Full reset creates an empty ready-to-use catalog',
  );
  check(
    await restartedOptions.evaluate(
      async () => (await chrome.scripting.getRegisteredContentScripts()).length === 0,
    ),
    'Full reset removes dynamic content registrations',
  );
  const report = {
    passed: results.length,
    checks: results,
    search: { accounts: 10000, inputToRenderedResultsMs: searchMs, thresholdMs: 200 },
    browser: browserVersion,
    machine: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
    limitations: [
      'Host permission prompt was bypassed only in a disposable extension copy for the local HTTPS fixture. Shipping manifest remains optional-only.',
      'The actual target application is not configured; real-site compatibility is unverified.',
    ],
  };
  await writeFile('artifacts/browser-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (context) await context.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
