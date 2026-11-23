import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assetIgnore,
  emitVoidCfOutput,
  lastMigrationTag,
  serverModules,
  workerConfigFrom,
} from './void-cf-output.mjs';

const meetLike = () => ({
  name: 'app-worker',
  account_id: 'acct',
  main: 'index.js',
  no_bundle: true,
  compatibility_date: '2026-09-06',
  compatibility_flags: ['nodejs_compat'],
  placement: { region: 'aws:ap-southeast-1' },
  workers_dev: false,
  preview_urls: false,
  upload_source_maps: true,
  routes: [{ pattern: 'app.example.com', custom_domain: true }],
  assets: {
    directory: '../client',
    binding: 'ASSETS',
    run_worker_first: true,
    not_found_handling: 'none',
  },
  vars: { PUBLIC_URL: 'https://app.example.com', FLAG: 'false' },
  secrets: { required: ['TOKEN'] },
  services: [
    { binding: 'SELF', service: 'app-worker' },
    { binding: 'GUARD', service: 'guard', entrypoint: 'GuardEntrypoint' },
  ],
  r2_buckets: [{ binding: 'CACHE', bucket_name: 'app-cache' }],
  images: { binding: 'IMAGES' },
  durable_objects: { bindings: [{ name: 'LIVE', class_name: 'LiveObject' }] },
  migrations: [{ tag: 'live-v1', new_sqlite_classes: ['LiveObject'] }],
  observability: { enabled: true, head_sampling_rate: 0.05 },
  kv_namespaces: [],
  queues: { producers: [], consumers: [] },
});

test('a --var override replaces a var the config already declares', () => {
  const config = workerConfigFrom(meetLike(), { vars: { FLAG: 'true' } });
  assert.deepEqual(config.env.FLAG, { type: 'text', value: 'true' });
  assert.deepEqual(config.env.PUBLIC_URL, {
    type: 'text',
    value: 'https://app.example.com',
  });
});

test('maps every serving binding into its Workers API wire shape', () => {
  const config = workerConfigFrom(meetLike(), {
    vars: { TTR_ONE_ORIGIN_APP: 'shadow' },
  });
  assert.deepEqual(config.env, {
    PUBLIC_URL: { type: 'text', value: 'https://app.example.com' },
    FLAG: { type: 'text', value: 'false' },
    TTR_ONE_ORIGIN_APP: { type: 'text', value: 'shadow' },
    TOKEN: { type: 'secret' },
    ASSETS: { type: 'assets' },
    SELF: { type: 'worker', worker: 'app-worker' },
    GUARD: { type: 'worker', worker: 'guard', exportName: 'GuardEntrypoint' },
    CACHE: { type: 'r2', name: 'app-cache' },
    IMAGES: { type: 'images' },
    LIVE: {
      type: 'unsafe:durable_object_namespace',
      class_name: 'LiveObject',
    },
  });
  assert.deepEqual(config.placement, { region: 'aws:ap-southeast-1' });
  assert.equal(config.assets.runWorkerFirst, true);
  assert.equal(config.observability.headSamplingRate, 0.05);
  // Never adopt the one-way `exports` lifecycle or send migrations.
  assert.equal(config.exports, undefined);
  assert.equal(config.unsafe, undefined);
  assert.equal(config.triggers, undefined);
});

test('renames the Worker and its self references for disposable rehearsals', () => {
  const config = workerConfigFrom(meetLike(), { name: 'app-rehearsal' });
  assert.equal(config.name, 'app-rehearsal');
  assert.equal(config.env.SELF.worker, 'app-rehearsal');
  assert.equal(config.env.GUARD.worker, 'guard');
  assert.equal(config.env.LIVE.type, 'unsafe:durable_object_namespace');
});

test('keeps a foreign Durable Object class as a typed binding', () => {
  const source = meetLike();
  source.durable_objects.bindings.push({
    name: 'ROOMS',
    class_name: 'Room',
    script_name: 'rooms-worker',
  });
  assert.deepEqual(workerConfigFrom(source).env.ROOMS, {
    type: 'durable-object',
    worker: 'rooms-worker',
    exportName: 'Room',
  });
});

test('fails closed on unsupported or ambiguous configuration', () => {
  const queue = meetLike();
  queue.queues.producers.push({ binding: 'Q', queue: 'q' });
  assert.throws(() => workerConfigFrom(queue), /queues/);
  const env = meetLike();
  env.services[1].environment = 'production';
  assert.throws(
    () => workerConfigFrom(env),
    /unsupported services field environment/
  );
  const tail = meetLike();
  tail.tail_consumers = [{ service: 'tail' }];
  assert.throws(() => workerConfigFrom(tail), /tail_consumers/);
  const duplicate = meetLike();
  assert.throws(
    () => workerConfigFrom(duplicate, { vars: { TOKEN: 'x' } }),
    /duplicate binding TOKEN/
  );
});

test('refuses any emitted setting it would not reproduce', () => {
  const cases = [
    (c) => (c.ai = { binding: 'AI' }),
    (c) => (c.triggers = { crons: ['* * * * *'] }),
    (c) => (c.rules = [{ type: 'Text', globs: ['**/*.txt'] }]),
    (c) => (c.placement = { hostname: 'db.example.com' }),
    (c) => (c.limits = { subrequests: 10 }),
    (c) => (c.browser = { binding: 'BROWSER' }),
    (c) => (c.assets.headers = '/a'),
    (c) => (c.durable_objects.bindings[0].environment = 'production'),
  ];
  for (const mutate of cases) {
    const config = meetLike();
    mutate(config);
    assert.throws(() => workerConfigFrom(config), /unsupported/);
  }
  const config = meetLike();
  Object.assign(config, {
    configPath: '/emitted',
    dev: { ip: 'localhost' },
    python_modules: { exclude: ['**/*.pyc'] },
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    triggers: {},
    exports: {},
    logfwdr: { bindings: [] },
  });
  assert.doesNotThrow(() => workerConfigFrom(config));
});

test('binds assets only when the config names a binding', () => {
  const config = meetLike();
  delete config.assets.binding;
  const result = workerConfigFrom(config);
  assert.equal(result.env.ASSETS, undefined);
  assert.equal(result.assets.runWorkerFirst, true);
});

test('records the last tag migration', () => {
  assert.equal(lastMigrationTag(meetLike()), 'live-v1');
  assert.equal(lastMigrationTag({}), null);
});

test('honors .assetsignore like the asset uploader', () => {
  const ignored = assetIgnore(['# note', 'emitted.json', '*.map', 'drafts/']);
  assert.equal(ignored('.assetsignore'), true);
  assert.equal(ignored('emitted.json'), true);
  assert.equal(ignored('assets/app.js.map'), true);
  assert.equal(ignored('drafts/a.html'), true);
  assert.equal(ignored('assets/app.js'), false);
  assert.equal(ignored('_headers'), false);
  for (const pattern of ['!keep', '**/*.map', 'a?.js', '[ab].js'])
    assert.throws(() => assetIgnore([pattern]), /unsupported/);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'void-cf-output-'));
  const server = join(root, 'dist/server');
  const client = join(root, 'dist/client');
  for (const dir of [
    join(server, 'assets'),
    join(server, '.vite'),
    join(client, 'assets'),
  ])
    mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(server, 'index.js'),
    'import "./assets/chunk.js";\nexport default {};\n'
  );
  writeFileSync(join(server, 'index.js.map'), '{}');
  writeFileSync(join(server, 'assets/chunk.js'), 'export const a = 1;\n');
  writeFileSync(join(server, 'assets/chunk.js.map'), '{}');
  writeFileSync(
    join(server, 'assets/resvg.wasm'),
    Buffer.from([0, 97, 115, 109])
  );
  writeFileSync(join(server, 'assets/font.bin'), Buffer.from([1, 2]));
  writeFileSync(join(server, 'assets/editor.css'), 'a{}');
  writeFileSync(join(server, '.dev.vars'), 'SECRET=never-uploaded\n');
  writeFileSync(join(server, '.vite/manifest.json'), '{}');
  writeFileSync(join(client, 'assets/app.js'), 'console.log(1);\n');
  writeFileSync(
    join(client, '_headers'),
    '/assets/*\n  Cache-Control: immutable\n'
  );
  writeFileSync(join(client, 'emitted.json'), '{}');
  writeFileSync(join(client, '.assetsignore'), 'emitted.json\n');
  const config = meetLike();
  writeFileSync(join(server, 'emitted.json'), JSON.stringify(config));
  return { root, server };
}

test('discovers every uploadable server module, never dotfiles', () => {
  const { root, server } = fixture();
  try {
    assert.deepEqual(serverModules(server, 'index.js', true), {
      'assets/chunk.js': { type: 'esm' },
      'assets/font.bin': { type: 'data' },
      'assets/resvg.wasm': { type: 'wasm' },
      'index.js': { type: 'esm' },
      'assets/chunk.js.map': { type: 'sourcemap' },
      'index.js.map': { type: 'sourcemap' },
    });
    assert.equal(
      Object.keys(serverModules(server, 'index.js', false)).some((name) =>
        name.endsWith('.map')
      ),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('emits schema-valid Build Output with a byte-addressed receipt', async () => {
  const { root, server } = fixture();
  try {
    const out = join(root, 'out');
    const result = await emitVoidCfOutput({
      configPath: join(server, 'emitted.json'),
      destination: out,
      sourceSha: 'a'.repeat(40),
      vars: { TTR_ONE_ORIGIN_APP: 'off' },
    });
    const base = '.cloudflare/output/v0/workers/default/';
    assert.equal(result.migrationTag, 'live-v1');
    assert.deepEqual(result.varOverrides, ['TTR_ONE_ORIGIN_APP']);
    assert.ok(result.files[`${base}bundle/assets/resvg.wasm`]);
    assert.ok(result.files[`${base}assets/_headers`]);
    assert.ok(result.files[`${base}assets/assets/app.js`]);
    for (const name of Object.keys(result.files)) {
      assert.doesNotMatch(
        name,
        /\.dev\.vars|\.vite\/|emitted\.json|\.assetsignore/
      );
    }
    const receipt = JSON.parse(readFileSync(join(out, 'void-cf-receipt.json')));
    assert.equal(receipt.worker, 'app-worker');
    assert.equal(receipt.sourceSha, 'a'.repeat(40));
    await assert.rejects(
      emitVoidCfOutput({
        configPath: join(server, 'emitted.json'),
        destination: out,
      }),
      /destination must not exist/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
