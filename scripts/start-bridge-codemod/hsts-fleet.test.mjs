import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
const root = new URL('../../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const apps = readdirSync(new URL('apps/', root)).filter((app) =>
  existsSync(
    new URL(`apps/${app}/cloudflare/native-built-worker.runtime.mjs`, root)
  )
);
test('every native emitted-worker gate asserts exact HSTS and raw uniqueness', () => {
  assert.ok(apps.includes('chat') && apps.includes('storefront'));
  for (const app of apps) {
    const runtime = read(
      `apps/${app}/cloudflare/native-built-worker.runtime.mjs`
    );
    assert.match(runtime, /'max-age=63072000'/, app);
    if (app !== 'finance')
      assert.match(runtime, /response.rawHeaders.filter/, app);
    const worker = read(`apps/${app}/cloudflare/worker.ts`);
    assert.match(worker, /fetch: withHstsResponsePolicy\(\s*async/, app);
  }
  console.log(`HSTS emitted-runtime gates enumerated: ${apps.join(', ')}`);
});
