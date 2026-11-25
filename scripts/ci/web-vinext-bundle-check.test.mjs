import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertAssetHeadersStamp,
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

const SHA = '0123456789abcdef0123456789abcdef01234567';

test('requires the stamped client _headers when a build commit is set', (t) => {
  const out = mkdtempSync(join(tmpdir(), 'web-vinext-stamp-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const bundle = join(out, 'workers/default/bundle');
  const assets = join(out, 'workers/default/assets');
  mkdirSync(bundle, { recursive: true });
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(bundle, 'index.mjs'), 'export default {};');
  assert.equal(checkVinextBundle(bundle).assetHeaders, null);
  assert.throws(
    () => checkVinextBundle(bundle, { commit: SHA }),
    /No client _headers/u
  );
  writeFileSync(join(assets, '_headers'), `/*\n  x-tuturuuu-build: ${SHA}\n`);
  assert.equal(
    checkVinextBundle(bundle, { commit: SHA }).assetHeaders,
    join(assets, '_headers')
  );
  const other = 'f'.repeat(40);
  assert.throws(
    () => checkVinextBundle(bundle, { commit: other }),
    /no "\/\*" rule/u
  );
});

test('accepts the stamp only inside the /* rule', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'web-vinext-stamp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, '_headers');
  const write = (text) => writeFileSync(file, text);
  write(`/sw.js\n  X-A: 1\n/*\n  x-tuturuuu-build: ${SHA}\n`);
  assert.equal(assertAssetHeadersStamp(dir, SHA), file);
  write(`/sw.js\n  x-tuturuuu-build: ${SHA}\n`);
  assert.throws(() => assertAssetHeadersStamp(dir, SHA), /no "\/\*" rule/u);
  write(`/*\nx-tuturuuu-build: ${SHA}\n`);
  assert.throws(() => assertAssetHeadersStamp(dir, SHA), /no "\/\*" rule/u);
  assert.throws(() => assertAssetHeadersStamp(dir, 'abc'), /40 lowercase hex/u);
});
