import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Server-only runtime APIs that must never be evaluated in a browser chunk.
// The client bundler resolves `node:async_hooks` to an empty module, so a
// chunk that constructs an AsyncLocalStorage throws at load and the whole app
// shows its error boundary.
export const FORBIDDEN_CLIENT_MARKERS = [
  'AsyncLocalStorage',
  'node:async_hooks',
];

export function findForbiddenMarkers(source) {
  return FORBIDDEN_CLIENT_MARKERS.filter((marker) => source.includes(marker));
}

function* clientChunks(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* clientChunks(path);
    else if (/\.[cm]?js$/u.test(entry)) yield path;
  }
}

export function scanClientBundle(dir) {
  const violations = [];
  for (const file of clientChunks(dir)) {
    const markers = findForbiddenMarkers(readFileSync(file, 'utf8'));
    if (markers.length > 0) violations.push({ file, markers });
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: client-bundle-guard.mjs <dist/client> [...]');
    process.exit(2);
  }
  let failed = false;
  for (const dir of dirs) {
    const violations = scanClientBundle(dir);
    for (const { file, markers } of violations) {
      failed = true;
      console.error(`client chunk ${file} references ${markers.join(', ')}`);
    }
    if (violations.length === 0) console.log(`client bundle clean: ${dir}`);
  }
  process.exit(failed ? 1 : 0);
}
