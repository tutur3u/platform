import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseJsonc, readBuildOutputConfig } from './cf-worker-parity.mjs';
import { prepareWranglerPublication } from './cf-wrangler-publication.mjs';

const root = resolve(
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: direct post-build gate, outside cached Turbo tasks.
  process.env.CF_PUBLICATION_TEST_ROOT ??
    join(dirname(fileURLToPath(import.meta.url)), '../..')
);
// biome-ignore lint/suspicious/noUndeclaredEnvVars: direct post-build gate, outside cached Turbo tasks.
const app = process.env.CF_PUBLICATION_TEST_APP;
assert.ok(
  ['coordination', 'devbox-control'].includes(app),
  'CF_PUBLICATION_TEST_APP must select a built Durable Object Worker'
);

function artifact(t) {
  const source = join(root, 'apps', app);
  const temp = mkdtempSync(join(tmpdir(), 'cf-real-publication-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const output = join(temp, '.cloudflare/output');
  mkdirSync(dirname(output), { recursive: true });
  cpSync(join(source, '.cloudflare/output'), output, {
    recursive: true,
    verbatimSymlinks: true,
  });
  const bundle = join(output, 'v0/workers/default/bundle');
  const metadata = join(bundle, '.vite/manifest.json');
  const vite = JSON.parse(readFileSync(metadata, 'utf8'));
  assert.ok(
    vite['virtual:cloudflare/worker-entry'],
    'requires real vp build metadata'
  );
  const { worker, accountId } = readBuildOutputConfig(temp);
  const declaration = join(source, 'wrangler.publish.jsonc');
  const baseline = join(
    root,
    `scripts/ci/fixtures/cf-worker-parity/${app}.json`
  );
  const run = () =>
    prepareWranglerPublication(temp, baseline, declaration, accountId);
  return { temp, bundle, metadata, worker, declaration, run };
}

test('real vp output prepares unchanged modules and applied v1 migrations', (t) => {
  const { bundle, worker, declaration, run } = artifact(t);
  const before = Object.fromEntries(
    Object.keys(worker.manifest.modules).map((name) => [
      name,
      readFileSync(join(bundle, name)),
    ])
  );
  const config = JSON.parse(readFileSync(run(), 'utf8'));
  assert.deepEqual(
    config.migrations,
    parseJsonc(readFileSync(declaration, 'utf8')).migrations
  );
  assert.equal(config.migrations[0].tag, 'v1');
  assert.equal(config.no_bundle, true);
  assert.equal(config.find_additional_modules, true);
  for (const [name, bytes] of Object.entries(before)) {
    assert.deepEqual(readFileSync(join(bundle, name)), bytes, name);
  }
});

test('real output still rejects every other undeclared metadata file', (t) => {
  const { bundle, run } = artifact(t);
  writeFileSync(join(bundle, '.vite/other.json'), '{}');
  assert.throws(run, /exactly the qualified modules/);
});

test('real output rejects a manifest symlink and a metadata directory symlink', (t) => {
  const { temp, bundle, metadata, run } = artifact(t);
  const outside = join(temp, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'manifest.json'), '{}');
  rmSync(metadata);
  symlinkSync(join(outside, 'manifest.json'), metadata);
  assert.throws(run, /metadata is symlinked/);
  rmSync(join(bundle, '.vite'), { recursive: true });
  symlinkSync(outside, join(bundle, '.vite'), 'dir');
  assert.throws(run, /metadata is symlinked/);
});
