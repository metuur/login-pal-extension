import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
let child;
let timer;
let pending = false;
let stopping = false;
const watchers = [];

function rebuild() {
  if (stopping) return;
  if (child) {
    pending = true;
    return;
  }
  pending = false;
  console.log('[dev] Building extension…');
  child = spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  child.on('error', (error) => console.error(`[dev] Could not start build: ${error.message}`));
  child.on('close', (code) => {
    child = undefined;
    if (stopping) return;
    console.log(
      code === 0
        ? '[dev] Ready: load/reload dist in chrome://extensions. Watching for changes…'
        : '[dev] Build failed. Fix the error and save to retry.',
    );
    if (pending) schedule();
  });
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
}
function stop() {
  stopping = true;
  clearTimeout(timer);
  watchers.forEach((watcher) => watcher.close());
  child?.kill('SIGTERM');
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  for (const directory of ['src', 'public', 'scripts'])
    watchers.push(watch(directory, { recursive: true }, schedule));
  const configFiles = new Set(['package.json', 'package-lock.json', 'tsconfig.json']);
  watchers.push(
    watch('.', (_event, filename) => {
      if (!filename || configFiles.has(filename.toString())) schedule();
    }),
  );
  watchers.forEach((watcher) =>
    watcher.on('error', (error) => {
      console.error(`[dev] File watcher failed: ${error.message}`);
      process.exitCode = 1;
      stop();
    }),
  );
  rebuild();
} catch (error) {
  console.error(`[dev] Could not start watchers: ${error.message}`);
  process.exitCode = 1;
  stop();
}
