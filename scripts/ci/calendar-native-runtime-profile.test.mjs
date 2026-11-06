import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { manifest } from './calendar-native-artifact.mjs';
import { sealCalendarArtifact } from './calendar-native-inventory.mjs';
import { denyCalendarOutbound } from './calendar-native-runtime-profile.mjs';
import {
  assertArtifactUnchanged,
  createNativeFinalizer,
  inspectArtifact,
  prepareNativePlan,
  sealArtifact,
} from './native-wrangler-runtime.mjs';

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
      html_handling: 'none',
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
    options.seal = await sealArtifact(options.root, 'calendar');
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
    await put('dist/client/.assetsignore', 'wrangler.json\n.dev.vars\n');
    await put('dist/server/.vite/manifest.json', {
      'worker.js': {
        file: 'worker.js',
        src: '/historical/source/worker.ts',
        isEntry: true,
      },
    });
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
    assert.deepEqual(
      await sealArtifact(options.root, 'calendar'),
      options.seal
    );
    await assert.rejects(
      inspectArtifact({ ...options, profile: undefined }),
      /Hidden artifact entry unsupported/
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
      options.seal = await sealArtifact(options.root, 'calendar');
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

test('Calendar actual hidden shape is copied and final seals retain every hidden hash', async () => {
  await calendarFixture(async ({ options }) => {
    const tempRoot = join(dirname(options.root), 'temp');
    await mkdir(tempRoot);
    const plan = await prepareNativePlan(options, tempRoot);
    assert.equal(plan.profile, 'calendar');
    assert.deepEqual(sealCalendarArtifact(plan.copyRoot), options.seal);
    assert.ok(options.seal['server/.vite/manifest.json']);
    assert.ok(options.seal['client/.assetsignore']);
    await assertArtifactUnchanged(plan);
    const foreignPath = join(dirname(options.root), 'foreign');
    await writeFile(foreignPath, 'unrelated');
    await mkdir(plan.sdkWorkingDir);
    await writeFile(join(plan.sdkWorkingDir, 'local-state'), 'owned SDK state');
    const result = await createNativeFinalizer({
      ...plan,
      foreignPath,
      foreignValue: 'unrelated',
    })([]);
    assert.equal(result.phases.originalSeal.ok, true);
    assert.equal(result.phases.copySeal.ok, true);
  });
});
test('Calendar finite inventory rejects hidden credentials, unknown metadata and links', async () => {
  for (const path of [
    'dist/.env',
    'dist/client/.env.local',
    'dist/server/.dev.vars',
    'dist/server/.dev.vars.preview',
    'dist/server/.vite/.env',
    'dist/server/.vite/credentials.json',
    'dist/client/.unknown',
  ])
    await calendarFixture(async ({ options, put }) => {
      await put(path, 'PRIVATE_VALUE');
      await assert.rejects(
        sealArtifact(options.root, 'calendar'),
        /Hidden Calendar/
      );
    });
  for (const value of [
    { 'worker.js': { file: 'worker.js', credentials: 'PRIVATE_VALUE' } },
    { 'worker.js': { file: '../worker.js' } },
    { 'worker.js': { file: 'worker.js', isEntry: 'true' } },
    { 'worker.js': { file: 'worker.js', imports: ['missing'] } },
    { 'worker.js': { file: 'worker.js', assets: ['missing.css'] } },
  ])
    await calendarFixture(async ({ options, put }) => {
      await put('dist/server/.vite/manifest.json', value);
      await assert.rejects(sealArtifact(options.root, 'calendar'));
    });
  await calendarFixture(async ({ options, put }) => {
    await put('dist/client/.assetsignore', 'wrangler.json\n.dev.vars\n.env\n');
    await assert.rejects(
      sealArtifact(options.root, 'calendar'),
      /ignore bytes changed/
    );
  });
  for (const path of ['client/.assetsignore', 'server/.vite/manifest.json']) {
    await calendarFixture(async ({ options }) => {
      const target = join(options.root, path);
      await rm(target);
      await symlink(options.main, target);
      await assert.rejects(
        sealArtifact(options.root, 'calendar'),
        /symlinks forbidden/
      );
    });
  }
});

test('Calendar finalization detects each hidden-file mutation independently and retains evidence', async () => {
  for (const original of [true, false]) {
    for (const name of ['client/.assetsignore', 'server/.vite/manifest.json']) {
      await calendarFixture(async ({ options }) => {
        const tempRoot = join(dirname(options.root), 'temp');
        await mkdir(tempRoot);
        const plan = await prepareNativePlan(options, tempRoot);
        const path = join(original ? options.root : plan.copyRoot, name);
        await writeFile(
          path,
          name.endsWith('manifest.json')
            ? JSON.stringify({
                'worker.js': { file: 'worker.js', name: 'changed' },
              })
            : 'changed ignore bytes'
        );
        const foreignPath = join(dirname(options.root), 'foreign');
        await writeFile(foreignPath, 'unrelated');
        const result = await createNativeFinalizer({
          ...plan,
          foreignPath,
          foreignValue: 'unrelated',
        })([]);
        assert.equal(result.phases.originalSeal.ok, !original);
        assert.equal(result.phases.copySeal.ok, original);
        assert.equal(result.phases.removal, undefined);
        assert.ok(result.errors.length > 0);
        assert.equal(await realpath(plan.scratch), plan.scratch);
      });
    }
  }
});

test('Calendar root __proto__ filename is sealed, copied and independently checked for mutations', async () => {
  for (const original of [true, false]) {
    await calendarFixture(async ({ options, put, save }) => {
      await put('dist/__proto__', 'prototype-named artifact bytes');
      await save();
      assert.equal(Object.hasOwn(options.seal, '__proto__'), true);
      assert.match(
        Object.getOwnPropertyDescriptor(options.seal, '__proto__').value,
        /^[a-f0-9]{64}$/
      );
      assert.equal(Object.getPrototypeOf(options.seal), Object.prototype);
      assert.deepEqual(JSON.parse(JSON.stringify(options.seal)), options.seal);
      const tempRoot = join(dirname(options.root), 'temp');
      await mkdir(tempRoot);
      const plan = await prepareNativePlan(options, tempRoot);
      assert.equal(
        await readFile(join(plan.copyRoot, '__proto__'), 'utf8'),
        'prototype-named artifact bytes'
      );
      assert.deepEqual(sealCalendarArtifact(plan.copyRoot), options.seal);
      await writeFile(
        join(original ? options.root : plan.copyRoot, '__proto__'),
        'changed prototype-named bytes'
      );
      if (original)
        await assert.rejects(
          assertArtifactUnchanged(plan),
          /Artifact hash mutation/
        );
      const foreignPath = join(dirname(options.root), 'foreign');
      await writeFile(foreignPath, 'unrelated');
      const result = await createNativeFinalizer({
        ...plan,
        foreignPath,
        foreignValue: 'unrelated',
      })([]);
      assert.equal(result.phases.originalSeal.ok, !original);
      assert.equal(result.phases.copySeal.ok, original);
      assert.equal(result.phases.removal, undefined);
      assert.ok(result.errors.length > 0);
      assert.equal(await realpath(plan.scratch), plan.scratch);
    });
  }
});
