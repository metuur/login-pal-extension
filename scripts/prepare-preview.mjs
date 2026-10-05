import { cp, mkdir } from 'node:fs/promises';
await mkdir('.preview-assets/fonts', { recursive: true });
for (const font of ['geist', 'inter', 'jetbrains-mono']) {
  for (const weight of font === 'jetbrains-mono' ? [400, 500] : [400, 500, 600, 700]) {
    const file = `${font}-latin-${weight}-normal.woff2`;
    await cp(`node_modules/@fontsource/${font}/files/${file}`, `.preview-assets/fonts/${file}`);
  }
  await cp(`node_modules/@fontsource/${font}/LICENSE`, `.preview-assets/fonts/${font}-LICENSE.txt`);
}
await cp('public/sample-accounts.csv', '.preview-assets/sample-accounts.csv');
