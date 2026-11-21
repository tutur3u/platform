import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkVinextBundle } from './web-vinext-bundle-check.mjs';

test('vinext bundle check rejects Redis in any emitted chunk', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'web-vinext-bundle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'ssr/_next/static'), { recursive: true });
  writeFileSync(join(dir, 'index.mjs'), 'export default {};');
  const chunk = join(dir, 'ssr/_next/static/route-a.mjs');
  writeFileSync(chunk, 'export const a = 1;');
  const result = checkVinextBundle(dir);
  assert.equal(result.redisFree, true);
  assert.equal(result.fileCount, 2);
  writeFileSync(chunk, 'import "@upstash/redis";');
  assert.throws(() => checkVinextBundle(dir), /route-a\.mjs/u);
  writeFileSync(chunk, 'class e extends Error {name="UpstashJSONParseError"}');
  assert.throws(() => checkVinextBundle(dir), /route-a\.mjs/u);
});

test('vinext bundle check requires the Worker entry', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'web-vinext-bundle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'other.mjs'), 'export {};');
  assert.throws(() => checkVinextBundle(dir), /index\.mjs/u);
});
