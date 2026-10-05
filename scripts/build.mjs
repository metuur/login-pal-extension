import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true, filter: (source) => !source.endsWith('AGENTS.md') });
await mkdir('dist/fonts', { recursive: true });
for (const font of ['geist','inter','jetbrains-mono']) {
  for (const weight of font === 'jetbrains-mono' ? [400,500] : [400,500,600,700]) {
    const file = `${font}-latin-${weight}-normal.woff2`;
    await cp(`node_modules/@fontsource/${font}/files/${file}`, `dist/fonts/${file}`);
  }
  await cp(`node_modules/@fontsource/${font}/LICENSE`, `dist/fonts/${font}-LICENSE.txt`);
}
await build({entryPoints:{background:'src/background/index.ts',content:'src/content/index.ts',popup:'src/popup/index.ts',options:'src/options/index.ts'},outdir:'dist',bundle:true,format:'iife',platform:'browser',target:'chrome120',legalComments:'none',minify:false});
