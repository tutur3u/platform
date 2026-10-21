import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { manifest } from './calendar-native-artifact.mjs';
import { denyCalendarOutbound } from './calendar-native-runtime-profile.mjs';
import { inspectArtifact, sealArtifact } from './native-wrangler-runtime.mjs';

const sourceSHA = 'a'.repeat(40);
async function calendarFixture(run) {
  const app = await realpath(
    await mkdtemp(join(tmpdir(), 'calendar-profile-'))
  );
  const config = {
    name: 'tuturuuu-calendar',
    main: './worker.js',
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  };
  async function put(path, value) {
    await mkdir(dirname(join(app, path)), { recursive: true });
    await writeFile(
      join(app, path),
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  }
  const options = {
    profile: 'calendar',
    root: join(app, 'dist'),
    config: join(app, 'dist/server/wrangler.json'),
    main: join(app, 'dist/server/worker.js'),
    ownerPackage: join(app, 'package.json'),
    sourceSHA,
    canonicalHost: 'calendar-ci.invalid',
    outbound: denyCalendarOutbound([]),
  };
  async function save() {
    await put('dist/server/wrangler.json', config);
    await put('calendar-artifact.json', manifest(app, sourceSHA));
    options.seal = await sealArtifact(options.root);
  }
  try {
    await put('.wrangler/deploy/config.json', {
      configPath: '../../dist/server/wrangler.json',
      auxiliaryWorkers: [],
    });
    await put(
      'dist/server/worker.js',
      'export default { fetch() { return new Response("fixture"); } };'
    );
    await put(
      'dist/client/serwist/sw.js',
      'self.addEventListener("fetch", () => {});'
    );
    await put(
      'cloudflare-env.d.ts',
      'interface CloudflareEnv { ASSETS: Fetcher }'
    );
    await save();
    await run({ options, config, save, put });
  } finally {
    await rm(app, { recursive: true });
  }
}
test('Calendar profile admits sealed owning config without changing any bytes', async () => {
  await calendarFixture(async ({ options }) => {
    const bytes = await readFile(options.config);
    const admitted = await inspectArtifact(options);
    assert.deepEqual(admitted.config.compatibility_flags, [
      'nodejs_compat',
      'global_fetch_strictly_public',
    ]);
    assert.equal(admitted.config.workers_dev, false);
    assert.deepEqual(admitted.bindings, {});
    assert.deepEqual(await readFile(options.config), bytes);
    assert.deepEqual(await sealArtifact(options.root), options.seal);
    await assert.rejects(
      inspectArtifact({ ...options, profile: undefined }),
      /Unsupported emitted config field/
    );
    await assert.rejects(
      inspectArtifact({ ...options, profile: 'other' }),
      /Unsupported runtime profile/
    );
    await assert.rejects(
      inspectArtifact({ ...options, externalWorkers: [{}] }),
      /External workers unsupported/
    );
    await assert.rejects(
      inspectArtifact({ ...options, outbound: undefined }),
      /Explicit deny-by-default/
    );
  });
});
test('Calendar profile rejects changed bytes, identity and unqualified config fields', async () => {
  for (const [key, value] of [
    ['compatibility_flags', []],
    ['workers_dev', true],
    ['build', { command: 'forbidden' }],
    ['services', [{ binding: 'REMOTE', service: 'ambient' }]],
    ['unknown', true],
  ]) {
    await calendarFixture(async ({ options, config, put }) => {
      config[key] = value;
      await put('dist/server/wrangler.json', config);
      options.seal = await sealArtifact(options.root);
      await assert.rejects(
        inspectArtifact(options),
        /artifact identity or bytes changed|unqualified config field|resource registration forbidden|Expected values/
      );
    });
  }
  await calendarFixture(async ({ options, put }) => {
    await assert.rejects(
      inspectArtifact({ ...options, sourceSHA: 'b'.repeat(40) }),
      /artifact identity or bytes changed/
    );
    await put('dist/server/worker.js', 'changed');
    await assert.rejects(inspectArtifact(options), /Artifact hash mutation/);
  });
});
test('Calendar fixture denies all nonfixture origins and methods without forwarding', async () => {
  const unexpected = [];
  const outbound = denyCalendarOutbound(unexpected);
  for (const url of [
    'https://provider.invalid/run',
    'http://127.0.0.1:1/private',
    'https://calendar-ci.invalid/api',
  ]) {
    for (const method of ['GET', 'POST']) {
      const response = await outbound(new Request(url, { method }));
      assert.equal(response.status, 599);
      assert.equal(await response.text(), 'Fixture forbids network');
    }
  }
  assert.deepEqual(unexpected, [
    'https://provider.invalid',
    'https://provider.invalid',
    'http://127.0.0.1:1',
    'http://127.0.0.1:1',
    'https://calendar-ci.invalid',
    'https://calendar-ci.invalid',
  ]);
});
