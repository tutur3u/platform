import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The generic RSC page adapter awaits ASYNC pages before streaming so a thrown
// redirect()/notFound() reaches the router. A synchronous page stays an element
// and its redirect surfaces as React error #441 in the browser instead.
const root = fileURLToPath(new URL('../..', import.meta.url));
const CONTROL_CALL = /\b(?:redirect|permanentRedirect|notFound)\(/u;
const SYNC_DEFAULT = /export\s+default\s+function\s+\w*\s*\(/u;

export function isSyncControlFlowPage(source) {
  return SYNC_DEFAULT.test(source) && CONTROL_CALL.test(source);
}

function* pageFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* pageFiles(path);
    else if (/^page\.[jt]sx?$/u.test(entry)) yield path;
  }
}

const rscApps = readdirSync(join(root, 'apps')).filter((app) => {
  const config = join(root, 'apps', app, 'vite.config.mts');
  return (
    existsSync(config) && /\brsc:\s*true\b/u.test(readFileSync(config, 'utf8'))
  );
});

test('detects a synchronous page that redirects', () => {
  assert.equal(
    isSyncControlFlowPage("export default function P() { redirect('/x'); }"),
    true
  );
  assert.equal(
    isSyncControlFlowPage(
      "export default async function P() { redirect('/x'); }"
    ),
    false
  );
  assert.equal(
    isSyncControlFlowPage('export default function P() { return null; }'),
    false
  );
});

test('no RSC-mode app page is a synchronous redirect or notFound page', () => {
  assert.ok(rscApps.length > 0, 'expected RSC-mode apps to scan');
  const offenders = [];
  for (const app of rscApps) {
    const appDir = join(root, 'apps', app, 'src', 'app');
    if (!existsSync(appDir)) continue;
    for (const file of pageFiles(appDir))
      if (isSyncControlFlowPage(readFileSync(file, 'utf8')))
        offenders.push(relative(root, file));
  }
  assert.deepEqual(offenders, []);
});
