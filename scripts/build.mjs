import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const development = !process.argv.includes('--production');
const name = development ? 'Login Pal DEV' : 'Login Pal';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (
  typeof version !== 'string' ||
  !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version) ||
  version.split('.').some((part) => Number(part) > 65535) ||
  version.split('.').every((part) => Number(part) === 0)
) {
  throw new Error(
    'package.json version must be a Chrome-compatible numeric version (1–4 components, 0–65535, not all zero).',
  );
}
const icons = Object.fromEntries(
  [16, 32, 48, 128].map((size) => [size, `icon-${development ? 'dev-' : ''}${size}.png`]),
);
const manifest = {
  manifest_version: 3,
  icons,
  name,
  description:
    'Switch accounts. Keep moving. A local account catalog for authorized QA login pages.',
  // 121 is the first version with tabs.lastAccessed, used to offer the most
  // recently used tabs as field-detection sources.
  minimum_chrome_version: '121',
  permissions: ['storage', 'scripting', 'activeTab', 'clipboardWrite'],
  // http is requestable on any host so QA environments served over plain http
  // can be authorized; the user still grants each origin explicitly.
  optional_host_permissions: ['https://*/*', 'http://*/*'],
  background: {
    service_worker: 'background.js',
  },
  action: {
    default_title: name,
    default_icon: icons,
    default_popup: 'popup.html',
  },
  options_ui: {
    page: 'options.html',
    open_in_tab: true,
  },
  incognito: 'not_allowed',
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'",
  },
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true, filter: (source) => !source.endsWith('AGENTS.md') });
await writeFile('dist/manifest.json', JSON.stringify({ ...manifest, version }, null, 2) + '\n');
await mkdir('dist/fonts', { recursive: true });
for (const font of ['geist', 'inter', 'jetbrains-mono']) {
  for (const weight of font === 'jetbrains-mono' ? [400, 500] : [400, 500, 600, 700]) {
    const file = `${font}-latin-${weight}-normal.woff2`;
    await cp(`node_modules/@fontsource/${font}/files/${file}`, `dist/fonts/${file}`);
  }
  await cp(`node_modules/@fontsource/${font}/LICENSE`, `dist/fonts/${font}-LICENSE.txt`);
}
await build({
  entryPoints: {
    background: 'src/background/index.ts',
    content: 'src/content/index.ts',
    popup: 'src/popup/index.ts',
    options: 'src/options/index.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome121',
  legalComments: 'none',
  minify: false,
});
