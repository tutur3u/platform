import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** A dependency's real directory, found the way Node walks node_modules. */
function packageDir(from, name) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json')))
      return realpathSync(candidate);
    if (dirname(dir) === dir) throw new Error(`${name} not found from ${from}`);
  }
}

/**
 * The workerd that `vp dev` runs: void → @cloudflare/vite-plugin →
 * miniflare → workerd. Its `compatibilityDate` is the newest date it supports.
 */
async function devWorkerd() {
  const miniflare = packageDir(
    packageDir(packageDir(appRoot, 'void'), '@cloudflare/vite-plugin'),
    'miniflare'
  );
  const fromMiniflare = createRequire(join(miniflare, 'package.json'));
  return import(pathToFileURL(fromMiniflare.resolve('workerd')).href);
}

test('the Worker compatibility date runs in the local dev runtime', async () => {
  const config = readFileSync(`${appRoot}void.config.ts`, 'utf8');
  const configured = /compatibility_date:\s*'(\d{4}-\d{2}-\d{2})'/.exec(
    config
  )?.[1];
  assert.ok(configured, 'void.config.ts sets a compatibility_date');
  const { compatibilityDate } = await devWorkerd();
  assert.match(compatibilityDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(
    configured <= compatibilityDate,
    `compatibility_date ${configured} is newer than the dev workerd supports (${compatibilityDate}); vp dev cannot start`
  );
});
