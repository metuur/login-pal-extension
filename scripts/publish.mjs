import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error?.code === 'ENOENT')
    throw new Error(`${command} is not installed; install it and run this again.`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed.`);
}

// Clean first: build.mjs also clears dist, but a publish run should never be
// able to pack a leftover file from an earlier build.
await rm('dist', { recursive: true, force: true });
run(process.execPath, ['scripts/build.mjs', '--production']);

// Name and version come from the manifest just written, so the archive can only
// ever be labelled with what is actually inside it.
const { name, version } = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const archive = `artifacts/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${version}.zip`;
await mkdir('artifacts', { recursive: true });
await rm(archive, { force: true });
// -X drops the extended attributes and -x the Finder files that the Chrome Web
// Store rejects in an uploaded package.
run('zip', ['-r', '-X', `../${archive}`, '.', '-x', '*.DS_Store'], { cwd: 'dist' });
console.log(`Packed ${archive}`);
