import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertPatchedRsdw,
  checkVinextBundle,
  isPatchedRsdwVersion,
} from './web-vinext-bundle-check.mjs';

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

test('accepts only react-server-dom-webpack patched for GHSA-xqc2-xf4c-x3h3', () => {
  for (const version of ['19.2.9', '19.2.10', '19.3.1', '19.4.0', '20.0.0']) {
    assert.equal(isPatchedRsdwVersion(version), true, version);
  }
  for (const version of [
    '19.2.8',
    '19.2.0',
    '19.1.10',
    '19.3.0',
    '19.3.0-canary-e04279e7-20261119',
    '19.2.9-canary-abc',
    '0.0.0-experimental-e04279e7-20261119',
    '18.3.1',
  ]) {
    assert.equal(isPatchedRsdwVersion(version), false, version);
  }
});

test('records the resolved react-server-dom-webpack and refuses a vulnerable one', (t) => {
  const app = mkdtempSync(join(tmpdir(), 'web-vinext-rsdw-'));
  t.after(() => rmSync(app, { recursive: true, force: true }));
  const pkg = join(app, 'node_modules/react-server-dom-webpack');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(app, 'package.json'), '{"name":"app"}');
  const write = (version) =>
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({ name: 'react-server-dom-webpack', version })
    );
  write('19.3.1');
  assert.equal(assertPatchedRsdw(app), '19.3.1');
  mkdirSync(join(app, 'bundle'));
  writeFileSync(join(app, 'bundle/index.mjs'), 'export default {};');
  assert.equal(
    checkVinextBundle(join(app, 'bundle'), { appDir: app })
      .reactServerDomWebpack,
    '19.3.1'
  );
  write('19.3.0');
  assert.throws(() => assertPatchedRsdw(app), /19\.3\.0 is vulnerable/u);
  assert.throws(
    () => checkVinextBundle(join(app, 'bundle'), { appDir: app }),
    /GHSA-xqc2-xf4c-x3h3/u
  );
});
