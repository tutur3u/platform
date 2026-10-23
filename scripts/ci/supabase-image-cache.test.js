const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {
  cacheKey,
  subsetImages,
  missingImages,
  imageList,
  trustedSave,
  pullBudget,
  pullImage,
  MAX_ARCHIVE_BYTES,
} = require('./supabase-image-cache.js');
const services = [
  ['supabase/postgres', '17.11.0.004'],
  ['supabase/postgres-meta', 'v0.100.0'],
  ['postgrest/postgrest', 'v16.4'],
  ['supabase/gotrue', 'v2.197.0'],
  ['supabase/realtime', 'v2.143.4'],
  ['supabase/storage-api', 'v1.82.1'],
  ['supabase/studio', '2026.10.12-sha-3699278'],
  ['supabase/edge-runtime', 'v1.77.4'],
  ['supabase/logflare', '1.53.0'],
  ['supabase/supavisor', '2.9.13'],
].map(([name, local]) => ({ name, local }));
const identity = {
  services,
  cliVersion: '2.121.0',
  registry: 'public.ecr.aws',
  profile: 'contract',
};
test('contract images derive versions from CLI metadata including temporary overrides', () => {
  assert.deepEqual(imageList(identity), [
    'public.ecr.aws/supabase/gotrue:v2.197.0',
    'public.ecr.aws/supabase/postgres:17.11.0.004',
    'public.ecr.aws/supabase/postgres-meta:v0.100.0',
    'public.ecr.aws/supabase/realtime:v2.143.4',
    'public.ecr.aws/supabase/storage-api:v1.82.1',
  ]);
  assert.ok(
    imageList({
      ...identity,
      services: services.map((s) =>
        s.name.endsWith('/postgres') ? { ...s, local: '17.6.1.168' } : s
      ),
    }).includes('public.ecr.aws/supabase/postgres:17.6.1.168')
  );
  assert.deepEqual(imageList({ ...identity, profile: 'contract-http' }), [
    'public.ecr.aws/supabase/gotrue:v2.197.0',
    'public.ecr.aws/supabase/kong:2.8.1',
    'public.ecr.aws/supabase/postgres:17.11.0.004',
    'public.ecr.aws/supabase/postgres-meta:v0.100.0',
    'public.ecr.aws/supabase/postgrest:v16.4',
    'public.ecr.aws/supabase/realtime:v2.143.4',
    'public.ecr.aws/supabase/storage-api:v1.82.1',
  ]);
});
test('full stack includes pinned supplemental images and omits disabled services', () => {
  const config = fs.readFileSync('apps/database/supabase/config.toml', 'utf8');
  const images = imageList({ ...identity, profile: 'full', config });
  assert.equal(images.length, 10);
  for (const image of ['kong:2.8.1', 'mailpit:v1.31.3', 'imgproxy:v3.26.0'])
    assert.ok(images.includes(`public.ecr.aws/supabase/${image}`));
  assert.ok(
    images.every(
      (image) => !/edge-runtime|logflare|vector|supavisor/.test(image)
    )
  );
  assert.throws(
    () =>
      imageList({
        ...identity,
        profile: 'full',
        config: config.replace(
          '[analytics]\nenabled = false',
          '[analytics]\nenabled = true'
        ),
      }),
    /Uncached service/
  );
  assert.equal(MAX_ARCHIVE_BYTES, 6 * 1024 ** 3);
});
test('catalog overlap uses CLI local tags once and rejects duplicate catalog names', () => {
  const config = fs.readFileSync('apps/database/supabase/config.toml', 'utf8');
  const overlap = [
    { name: 'library/kong', local: '2.8.1' },
    { name: 'axllent/mailpit', local: 'v1.31.3' },
    { name: 'darthsim/imgproxy', local: 'v3.26.0' },
  ];
  const options = { ...identity, profile: 'full', config };
  assert.deepEqual(
    imageList({ ...options, services: [...services, ...overlap] }),
    imageList(options)
  );
  const images = imageList({
    ...options,
    services: [...services, { ...overlap[1], local: 'v1.31.4' }],
  });
  assert.equal(images.length, 10);
  assert.ok(images.includes('public.ecr.aws/supabase/mailpit:v1.31.4'));
  assert.ok(!images.includes('public.ecr.aws/supabase/mailpit:v1.31.3'));
  assert.throws(
    () =>
      imageList({
        ...options,
        services: [...services, ...overlap, overlap[0]],
      }),
    /Duplicate CLI image metadata/
  );
});
test('unknown versions, profiles, registry and malformed metadata fail closed', () => {
  for (const patch of [
    { cliVersion: '2.118.0' },
    { profile: 'typo' },
    { registry: 'https://user:secret@ghcr.io' },
    { services: [] },
    { services: [...services, services[0]] },
    { services: [{ name: 'supabase/postgres', local: 'v1;secret' }] },
  ])
    assert.throws(() => imageList({ ...identity, ...patch }));
});
test('cache identity is order stable and binds images, registry, OS and architecture', () => {
  const input = {
    images: imageList(identity),
    registry: identity.registry,
    platform: 'linux',
    arch: 'x64',
  };
  const key = cacheKey(input);
  assert.equal(
    cacheKey({ ...input, images: [...input.images].reverse() }),
    key
  );
  for (const patch of [
    { images: [input.images[0]] },
    { images: ['public.ecr.aws/supabase/postgres:other'] },
    { registry: 'ghcr.io' },
    { platform: 'darwin' },
    { arch: 'arm64' },
  ])
    assert.notEqual(cacheKey({ ...input, ...patch }), key);
});
test('only pushes and manual dispatch on main populate caches', () => {
  for (const event of [
    'push',
    'workflow_dispatch',
    'pull_request',
    'pull_request_target',
    'workflow_run',
  ])
    for (const ref of [
      'refs/heads/main',
      'refs/heads/production',
      'refs/heads/feature/test',
      'refs/pull/6409/merge',
    ])
      assert.equal(
        trustedSave(event, ref),
        ref === 'refs/heads/main' &&
          ['push', 'workflow_dispatch'].includes(event)
      );
});

test('extended seed budget is main-only and normal misses retain two minutes', () => {
  assert.equal(
    pullBudget(undefined, 'pull_request', 'refs/pull/1/merge'),
    120000
  );
  assert.equal(
    pullBudget('600', 'workflow_dispatch', 'refs/heads/main'),
    600000
  );
  assert.throws(() => pullBudget('600', 'pull_request', 'refs/pull/1/merge'));
  assert.throws(() =>
    pullBudget('600', 'workflow_dispatch', 'refs/heads/feature/test')
  );
  assert.throws(() => pullBudget('900', 'push', 'refs/heads/main'));
});

test('real cache helper pulls only on miss, saves only trusted archives, and loads without pulls', async (t) => {
  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-cache-helper-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const database = path.join(root, 'database');
  fs.mkdirSync(path.join(database, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(database, 'supabase'));
  fs.writeFileSync(path.join(database, 'supabase/config.toml'), '');
  fs.writeFileSync(
    path.join(database, 'scripts/run-supabase.js'),
    `console.log(process.argv.includes('--version') ? '2.121.0' : ${JSON.stringify(JSON.stringify(services))});`
  );
  const docker = path.join(root, 'docker');
  fs.writeFileSync(
    docker,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'calls'), JSON.stringify(args) + '\\n');
if (args[0] === 'image') {
  if (!fs.existsSync(path.join(root, 'present'))) process.exit(1);
  console.log(args.includes('--format') ? '100' : '[]');
}
if (args[0] === 'save') fs.writeFileSync(args[2], 'test archive');
`
  );
  fs.chmodSync(docker, 0o755);
  const env = {
    ...process.env,
    PATH: `${root}:${process.env.PATH}`,
    RUNNER_TEMP: root,
    IMAGE_DATABASE: database,
    IMAGE_PROFILE: 'contract',
    SUPABASE_INTERNAL_IMAGE_REGISTRY: 'public.ecr.aws',
    GITHUB_OUTPUT: path.join(root, 'output'),
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_REF: 'refs/pull/6409/merge',
  };
  const run = (mode) =>
    execFileSync(
      process.execPath,
      ['scripts/ci/supabase-image-cache.js', mode],
      { env, encoding: 'utf8' }
    );
  run('key');
  assert.match(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'), /save=false/);
  run('pull');
  const calls = () =>
    fs
      .readFileSync(path.join(root, 'calls'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
  assert.equal(calls().filter((args) => args[0] === 'pull').length, 5);
  assert.equal(
    calls().some((args) => args[0] === 'save'),
    false
  );
  fs.writeFileSync(path.join(root, 'present'), '');
  env.GITHUB_EVENT_NAME = 'workflow_dispatch';
  env.GITHUB_REF = 'refs/heads/main';
  run('key');
  assert.match(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'), /save=true/);
  env.IMAGE_SAVE = 'true';
  run('pull');
  assert.equal(calls().filter((args) => args[0] === 'save').length, 1);
  env.IMAGE_PROFILE = 'contract-http';
  run('key');
  assert.match(
    fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'),
    /subset-key=supabase-images-v1-/
  );
  assert.match(
    run('load-subset'),
    /Loaded and verified 5 cached Supabase images/
  );
  run('pull');
  assert.deepEqual(
    calls()
      .filter((args) => args[0] === 'save')
      .at(-1)
      .slice(3),
    imageList({ ...identity, profile: 'contract-http' })
  );
  env.IMAGE_PROFILE = 'contract';
  run('key');
  const pulls = calls().filter((args) => args[0] === 'pull').length;
  assert.match(run('load'), /Loaded and verified 5 cached Supabase images/);
  assert.equal(calls().filter((args) => args[0] === 'pull').length, pulls);
  assert.equal(calls().filter((args) => args[0] === 'load').length, 2);
});

test('deadline exhaustion retains the last registry classification and bootstrap instruction', async () => {
  let now = 0;
  const messages = [];
  const result = await pullImage('public.ecr.aws/supabase/realtime:v2', {
    deadline: 100,
    budget: 120000,
    now: () => now,
    spawn: () => ({ status: 1, stderr: 'HTTP 429 secret-token' }),
    retryOptions: {
      sleepMs: async () => {
        now = 101;
      },
      random: () => 0,
    },
    stderr: { write: (message) => messages.push(message) },
  });
  assert.equal(result.code, 1);
  assert.equal(
    messages[0],
    'Supabase image pull throttled after 1 attempts (public.ecr.aws supabase/realtime).\n'
  );
  assert.match(messages[1], /trusted main run/);
  assert.ok(messages.every((message) => !message.includes('secret-token')));
});

test('reuse admits only an exact strict contract subset', () => {
  const config = fs.readFileSync('apps/database/supabase/config.toml', 'utf8');
  assert.deepEqual(subsetImages(identity), []);
  for (const profile of ['contract-http', 'full']) {
    const options = { ...identity, profile, config };
    assert.deepEqual(subsetImages(options), imageList(identity));
    assert.equal(
      cacheKey({
        images: subsetImages(options),
        registry: identity.registry,
        platform: 'linux',
        arch: 'x64',
      }),
      cacheKey({
        images: imageList(identity),
        registry: identity.registry,
        platform: 'linux',
        arch: 'x64',
      })
    );
  }
  assert.deepEqual(
    subsetImages({
      ...identity,
      profile: 'full',
      config: config.replace(
        '[auth]\nenabled = true',
        '[auth]\nenabled = false'
      ),
    }),
    []
  );
});

test('missing-only pull list inspects every exact tag and treats inspect failure as missing', () => {
  const images = imageList({ ...identity, profile: 'contract-http' });
  const present = new Set(imageList(identity));
  const calls = [];
  const missing = missingImages(images, (command, args, options) => {
    calls.push(args.at(-1));
    assert.equal(command, 'docker');
    assert.deepEqual(args.slice(0, 2), ['image', 'inspect']);
    assert.equal(options.timeout, 10000);
    return { status: present.has(args.at(-1)) ? 0 : null };
  });
  assert.deepEqual(calls, images);
  assert.deepEqual(
    missing,
    images.filter((image) => !present.has(image))
  );
  assert.equal(missing.length, 2);
});
