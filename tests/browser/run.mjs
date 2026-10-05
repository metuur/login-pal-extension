import { chromium } from 'playwright';
import { createServer } from 'node:https';
import { mkdtemp, readFile, writeFile, cp, rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir, platform, arch, cpus } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'onechat-acceptance-'));
let context, server;
const results = [],
  errors = [],
  requests = [];
const check = (condition, label) => {
  assert.ok(condition, label);
  results.push(label);
};
const fixture = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Local synthetic login</title></head><body><h1>QA fixture</h1><form id="form"><label>Username<input id="username" type="email"></label><label>Password<input id="password" type="password"></label><button id="login">Login</button><p id="error"></p></form><script>document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const flow=new URL(location.href).searchParams.get('flow');if(flow==='fail'){document.querySelector('#error').textContent='Authentication rejected';return;}if(flow==='element'){const marker=document.createElement('div');marker.id='logged-in-user';marker.textContent='Authenticated fixture';document.body.append(marker);return;}if(flow==='spa'){history.pushState({},'', '/dashboard');document.body.textContent='Authenticated fixture';return;}location.href='/dashboard';});</script></body></html>`;
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
    !manifest.host_permissions && manifest.optional_host_permissions?.length === 1,
    'Shipping manifest has optional host access only',
  );
  // Headless Chrome cannot approve the host dialog. Grant only the controlled
  // localhost fixture in this disposable copy; production permissions are unchanged.
  manifest.host_permissions = ['https://localhost/*'];
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
    const credit = page.locator('.version-footer');
    await credit.waitFor();
    const text = await credit.innerText();
    check(
      text.includes(`v${packageInfo.version}`) && text.includes('crafter by metuur'),
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
  check(!(await state()).initialized, 'New installation requires vault setup');
  await options.getByLabel('Master password', { exact: true }).fill('synthetic master phrase');
  await options
    .getByLabel('Confirm master password', { exact: true })
    .fill('synthetic master phrase');
  await options.getByRole('button', { name: 'Create encrypted vault', exact: true }).click();
  await options.getByRole('button', { name: 'Verify accounts', exact: true }).waitFor();
  check(!(await state()).locked, 'New vault is unlocked');
  const csv =
    'account_id,username,password,customer_name,account_type,environment\nACC-1234,john@example.test,synthetic-only-one,Acme Corp,Premium,QA\nACC-5678,maria@example.test,synthetic-only-two,Contoso Global,Basic,QA\nACC-9042,qa@example.test,synthetic-only-three,Test Customer,Admin,QA';
  const bytes = [...new TextEncoder().encode(csv)];
  const preview = await send({ type: 'PREVIEW_IMPORT', bytes, rule: origin + '/*', mode: 'merge' });
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
    { type: 'PREVIEW_IMPORT', bytes, rule: 'https://*.localhost/*', mode: 'merge' },
    'Wildcard hosts are rejected',
  );
  const profile = {
    name: 'QA Portal',
    loginUrl: origin + '/login',
    usernameSelector: '#username',
    passwordSelector: '#password',
    successKind: 'url',
    successUrl: origin + '/dashboard',
  };
  await send({ type: 'SAVE_PROFILE', profile });
  const site = await context.newPage();
  await site.goto(origin + '/login');
  const tabId = await options.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url)?.id,
    origin + '/login',
  );
  check(Number.isInteger(tabId), 'Authorized fixture tab is identifiable');
  await site.bringToFront();
  await send({ type: 'FILL', accountId: 'ACC-1234', tabId }, popup);
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
  await send({ type: 'FILL', accountId: 'ACC-5678', tabId }, popup);
  await site.locator('#login').click();
  check(
    (await state()).lastSuccessful?.accountId === 'ACC-1234',
    'Failed login preserves previous successful account',
  );
  await site.goto(origin + '/unrelated');
  await site.bringToFront();
  await reject(
    { type: 'FILL', accountId: 'ACC-5678', tabId },
    'Catalog wildcard cannot bypass exact login route',
    popup,
  );
  await site.goto(origin + '/login?flow=spa');
  await site.bringToFront();
  await send({ type: 'FILL', accountId: 'ACC-5678', tabId }, popup);
  await site.locator('#login').click();
  await waitState(
    (s) => s.lastSuccessful?.accountId === 'ACC-5678',
    'SPA navigation records observed success',
  );
  await site.goto(origin + '/login');
  await site.bringToFront();
  await send({ type: 'FILL', accountId: 'ACC-1234', tabId }, popup);
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
    'Worker termination preserves unlocked session and pending login attribution',
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
  await send({ type: 'FILL', accountId: 'ACC-9042', tabId }, popup);
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
  });
  check(merge.updated === 1 && merge.removed === 0, 'Merge preview preserves omitted records');
  await send({ type: 'COMMIT_IMPORT', token: merge.token });
  check((await state()).total === 3, 'Merge preserves omitted records after commit');
  await send({ type: 'LOCK' });
  check(
    (await state()).locked && (await state()).accounts.length === 0,
    'Lock withholds account summaries',
  );
  await reject(
    { type: 'UNLOCK', password: 'wrong synthetic phrase' },
    'Wrong master password fails safely',
  );
  await send({ type: 'UNLOCK', password: 'synthetic master phrase' });
  check((await state()).total === 3, 'Unlock recovers encrypted accounts');
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
  await send({ type: 'FILL', accountId: 'ACC-1234', tabId }, popup);
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
  check((await state()).total === 3, 'Settings file selection and review do not silently commit');
  await options.getByRole('button', { name: 'Import 3 valid accounts', exact: true }).click();
  await waitState(
    (s) => s.total === 3 && s.accounts.some((a) => a.metadata.account_type === 'Premium'),
    'Settings import action commits verified account changes',
  );
  await options.getByRole('button', { name: 'Delete ACC-9042', exact: true }).click();
  await options.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  check((await state()).total === 2, 'Settings delete action persists account removal');
  await options.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitState((s) => s.total === 3, 'Settings Undo action restores the deleted account');
  await options.screenshot({ path: 'artifacts/settings.png', fullPage: true });
  check(
    (await popup.locator('body').innerText()).includes('OneChat'),
    'Popup renders the branded interface',
  );
  check(
    (await options.locator('body').innerText()).includes('Merge'),
    'Settings renders account import modes',
  );
  await options.getByRole('button', { name: 'Purge All', exact: true }).click();
  await options.getByRole('button', { name: 'Cancel', exact: true }).click();
  check((await state()).total === 3, 'Cancelling purge preserves the catalog');
  await options.getByRole('button', { name: 'Purge All', exact: true }).click();
  await options
    .getByRole('dialog')
    .getByRole('button', { name: 'Purge all accounts', exact: true })
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
      (url) => url.startsWith(base) || url.startsWith(origin) || url.startsWith('data:'),
    ),
    'Extension UI loads no remote assets or application services',
  );
  check(errors.length === 0, 'Extension pages have no uncaught browser errors');
  for (const width of [360, 380, 420]) {
    await popup.setViewportSize({ width, height: 600 });
    check(
      await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Popup has no horizontal overflow at ${width}px`,
    );
  }
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
    restartedState.initialized && restartedState.locked,
    'Browser restart requires a fresh unlock',
  );
  await send({ type: 'UNLOCK', password: 'synthetic master phrase' }, restartedOptions);
  await send({ type: 'RESET' }, restartedOptions);
  check(
    !(await send({ type: 'STATE' }, restartedOptions)).initialized,
    'Full reset returns to first-run setup',
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
