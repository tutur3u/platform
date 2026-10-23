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
  ['supabase/postgres', '17.6.1.167'],
  ['supabase/postgres-meta', 'v0.99.0'],
  ['postgrest/postgrest', 'v16.2'],
  ['supabase/gotrue', 'v2.196.0'],
  ['supabase/realtime', 'v2.130.0'],
  ['supabase/storage-api', 'v1.72.1'],
  ['supabase/studio', '2026.08.24-sha-8ec45b2'],
].map(([name, local]) => ({ name, local }));
const identity = {
  services,
  cliVersion: '2.117.0',
  registry: 'public.ecr.aws',
  profile: 'contract',
};
test('contract images derive versions from CLI metadata including temporary overrides', () => {
  assert.deepEqual(imageList(identity), [
    'public.ecr.aws/supabase/gotrue:v2.196.0',
    'public.ecr.aws/supabase/postgres:17.6.1.167',
    'public.ecr.aws/supabase/postgres-meta:v0.99.0',
    'public.ecr.aws/supabase/realtime:v2.130.0',
    'public.ecr.aws/supabase/storage-api:v1.72.1',
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
    'public.ecr.aws/supabase/gotrue:v2.196.0',
    'public.ecr.aws/supabase/kong:2.8.1',
    'public.ecr.aws/supabase/postgres:17.6.1.167',
    'public.ecr.aws/supabase/postgres-meta:v0.99.0',
    'public.ecr.aws/supabase/postgrest:v16.2',
    'public.ecr.aws/supabase/realtime:v2.130.0',
    'public.ecr.aws/supabase/storage-api:v1.72.1',
  ]);
});
test('full stack includes pinned supplemental images and omits disabled services', () => {
  const config = fs.readFileSync('apps/database/supabase/config.toml', 'utf8');
  const images = imageList({ ...identity, profile: 'full', config });
  assert.equal(images.length, 10);
  for (const image of ['kong:2.8.1', 'mailpit:v1.30.2', 'imgproxy:v3.8.0'])
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
    `console.log(process.argv.includes('--version') ? '2.117.0' : ${JSON.stringify(JSON.stringify(services))});`
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
if (args[0] === 'image' && process.env.IMAGE_SEED_CATALOG === 'cli-2.121.0') {
  if (args.includes('--format')) { console.log('100'); process.exit(0); }
  const pins = ${JSON.stringify(require('./supabase-image-cache-seed-data.json').catalogs['cli-2.121.0'].images)};
  const reference = args.at(-1);
  const entry = Object.entries(pins).find(([image, pin]) => image === reference || image.split(':')[0] + '@' + pin.amd64 === reference);
  if (!entry) process.exit(1);
  const [image, pin] = entry;
  const digest = image.split(':')[0] + '@' + pin.amd64;
  if (!fs.readFileSync(path.join(root, 'calls'), 'utf8').includes(JSON.stringify(['pull', '--platform', 'linux/amd64', digest]))) process.exit(1);
  console.log(JSON.stringify([{ Os: 'linux', Architecture: 'amd64', Id: pin.config, RepoDigests: [digest] }]));
  process.exit(0);
}
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
  env.IMAGE_SAVE = 'true';
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
  // A fixed catalog must never invoke installed CLI or PR code.
  fs.writeFileSync(
    path.join(database, 'scripts/run-supabase.js'),
    'process.exit(99)'
  );
  const platformFixture = path.join(root, 'linux-platform.cjs');
  fs.writeFileSync(
    platformFixture,
    "Object.defineProperty(process, 'platform', { value: 'linux' }); Object.defineProperty(process, 'arch', { value: 'x64' });"
  );
  env.NODE_OPTIONS = `--require=${platformFixture}`;
  env.IMAGE_SEED_CATALOG = 'cli-2.121.0';
  env.IMAGE_PULL_BUDGET_SECONDS = '600';
  run('key');
  assert.match(
    fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'),
    /key=supabase-images-v1-1f27e9c5ae4e1b32fe7e337cfb66488d653f2ca75e5d70920ef07e45f37a9cf0/
  );
  const before = calls().length;
  run('pull');
  const futureCalls = calls().slice(before);
  assert.equal(futureCalls.filter((args) => args[0] === 'pull').length, 5);
  assert.equal(futureCalls.filter((args) => args[0] === 'tag').length, 5);
  assert.deepEqual(
    futureCalls.find((args) => args[0] === 'save').slice(3),
    seedCatalog('cli-2.121.0', futureContext)
  );
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

const {
  seedCatalog,
  catalogPin,
  fallbackPin,
  digestReference,
  verifyPinned,
} = require('./supabase-image-cache-seed.js');
const seedContext = {
  trusted: true,
  budget: 600000,
  platform: 'linux',
  arch: 'x64',
};
const futureContext = {
  ...seedContext,
  registry: 'public.ecr.aws',
  profile: 'contract',
};
const gotrue = 'public.ecr.aws/supabase/gotrue:v2.196.0';

test('only the fixed trusted Linux seed catalog bypasses installed CLI metadata', () => {
  for (const name of [undefined, '', 'current'])
    assert.equal(seedCatalog(name, { ...futureContext, trusted: false }), null);
  for (const patch of [
    { trusted: false },
    { budget: 120000 },
    { registry: 'ghcr.io' },
    { platform: 'darwin' },
    { arch: 'arm64' },
    { profile: 'unknown' },
  ])
    assert.throws(() =>
      seedCatalog('cli-2.121.0', { ...futureContext, ...patch })
    );
  for (const name of ['__proto__', 'cli-2.122.0', 'https://arbitrary'])
    assert.throws(() => seedCatalog(name, futureContext));
  assert.throws(() => catalogPin('cli-2.121.0', gotrue));
});

test('all three future seed keys equal consumer keys and current keys remain unchanged', () => {
  const expected = [
    [
      'contract',
      '229d3fa96dc11003926d8c5c3091c544fc4ce1fd6cb56d1ca94d696f961c6931',
      '1f27e9c5ae4e1b32fe7e337cfb66488d653f2ca75e5d70920ef07e45f37a9cf0',
    ],
    [
      'contract-http',
      '22ec2badf2f791f9c51b19b371e2722570d4e420383804a697c2fb2efe2c6036',
      'f0bd567d6109866d8f088db24b26800bac970f3263c96026557ae0168c1bdbe1',
    ],
    [
      'full',
      '75a831d01e0b1689c7a40ae43b79dd5e838b394ef37fa5d43bc3290213c551eb',
      '605f4bc0796aa6e082f6e8e913a484da99d5eb46a49a049eceb6fc30202bec9e',
    ],
  ];
  const config = fs.readFileSync('apps/database/supabase/config.toml', 'utf8');
  for (const [profile, currentKey, futureKey] of expected) {
    const key = (images) =>
      cacheKey({
        images,
        registry: 'public.ecr.aws',
        platform: 'linux',
        arch: 'x64',
      });
    assert.equal(
      key(imageList({ ...identity, profile, config })),
      `supabase-images-v1-${currentKey}`
    );
    const images = seedCatalog('cli-2.121.0', { ...futureContext, profile });
    assert.equal(key(images), `supabase-images-v1-${futureKey}`);
    for (const image of images) {
      const pin = catalogPin('cli-2.121.0', image);
      for (const field of ['index', 'amd64', 'config'])
        assert.match(pin[field], /^sha256:[a-f0-9]{64}$/);
    }
  }
});

function seedDocker(pin, source, patch = {}) {
  return {
    status: 0,
    stdout: JSON.stringify([
      {
        Os: 'linux',
        Architecture: 'amd64',
        Id: pin.config,
        RepoDigests: [digestReference(source, pin)],
        ...patch,
      },
    ]),
  };
}

test('platform verification rejects wrong manifest, config and architecture before tagging', () => {
  const pin = fallbackPin(gotrue, seedContext);
  for (const patch of [
    { RepoDigests: [] },
    { Id: 'sha256:wrong' },
    { Architecture: 'arm64' },
    { Os: 'windows' },
  ]) {
    assert.throws(
      () =>
        verifyPinned(gotrue, pin, {
          deadline: 100,
          now: () => 0,
          spawn: () => seedDocker(pin, gotrue, patch),
        }),
      /digest mismatch/
    );
  }
  assert.throws(
    () => verifyPinned(gotrue, pin, { deadline: 100, now: () => 100 }),
    /deadline/
  );
});

test('throttled ECR seed uses one existing attempt for the fixed official digest and canonical tag', async () => {
  const pin = fallbackPin(gotrue, seedContext);
  const source = `${pin.repository}@${pin.amd64}`;
  const calls = [];
  const result = await pullImage(gotrue, {
    deadline: 100000,
    budget: 600000,
    now: () => 0,
    seedContext,
    retryOptions: { sleepMs: async () => {}, random: () => 0 },
    spawn: (_command, args, options) => {
      calls.push(args);
      assert.ok(options.timeout <= 90000);
      if (args[0] === 'pull')
        return args.at(-1) === gotrue
          ? { status: 1, stderr: 'toomanyrequests' }
          : { status: 0 };
      if (args[0] === 'image') return seedDocker(pin, source);
      return { status: 0 };
    },
  });
  assert.equal(result.code, 0);
  assert.deepEqual(calls, [
    ['pull', gotrue],
    ['pull', '--platform', 'linux/amd64', source],
    ['image', 'inspect', source],
    ['tag', source, gotrue],
  ]);
});

test('untrusted refs, unknown images and non-throttle errors never use the alternate transport', async () => {
  for (const [image, context, diagnostic, count] of [
    [gotrue, { ...seedContext, trusted: false }, 'HTTP 429', 7],
    [gotrue, { ...seedContext, budget: 120000 }, 'HTTP 429', 3],
    ['public.ecr.aws/supabase/imgproxy:v3.8.0', seedContext, 'HTTP 429', 7],
    ['__proto__', seedContext, 'HTTP 429', 7],
    [gotrue, seedContext, 'manifest unknown', 1],
    [gotrue, seedContext, 'authentication required HTTP 429', 1],
    [gotrue, seedContext, 'connection reset', 7],
  ]) {
    const calls = [];
    const result = await pullImage(image, {
      deadline: 100000,
      budget: context.budget,
      now: () => 0,
      seedContext: context,
      retryOptions: { sleepMs: async () => {}, random: () => 0 },
      stderr: { write() {} },
      spawn: (_command, args) => {
        calls.push(args);
        return { status: 1, stderr: diagnostic };
      },
    });
    assert.equal(result.code, 1);
    assert.equal(calls.length, count);
    assert.ok(calls.every((args) => args.at(-1) === image));
  }
});

test('alternate failure or digest mismatch stops without retrying or tagging', async () => {
  for (const mismatch of [false, true]) {
    const calls = [];
    const messages = [];
    const result = await pullImage(gotrue, {
      deadline: 100000,
      budget: 600000,
      now: () => 0,
      seedContext,
      retryOptions: { sleepMs: async () => {}, random: () => 0 },
      stderr: { write: (s) => messages.push(s) },
      spawn: (_command, args) => {
        calls.push(args);
        if (args[0] === 'image')
          return { status: 0, stdout: '[{"RepoDigests":[]}]' };
        return args.at(-1) === gotrue || !mismatch
          ? { status: 1, stderr: 'HTTP 429 private-secret' }
          : { status: 0 };
      },
    });
    assert.equal(result.code, 1);
    assert.equal(calls.filter((args) => args[0] === 'pull').length, 2);
    assert.ok(calls.every((args) => args[0] !== 'tag'));
    assert.ok(messages.every((s) => !s.includes('private-secret')));
  }
});

test('future catalog producer pulls pinned ECR manifests and tags consumer references', async () => {
  const image = seedCatalog('cli-2.121.0', futureContext).find((s) =>
    s.includes('/postgres:')
  );
  const pin = catalogPin('cli-2.121.0', image);
  const source = digestReference(image, pin);
  const calls = [];
  assert.equal(
    (
      await pullImage(image, {
        deadline: 100000,
        budget: 600000,
        now: () => 0,
        seedContext,
        pin,
        spawn: (_command, args) => {
          calls.push(args);
          return args[0] === 'image' ? seedDocker(pin, source) : { status: 0 };
        },
      })
    ).code,
    0
  );
  assert.deepEqual(calls, [
    ['pull', '--platform', 'linux/amd64', source],
    ['image', 'inspect', source],
    ['tag', source, image],
  ]);
});

test('seed workflow keeps fixed main-only choices, serial profiles and read-only permissions', () => {
  const { readWorkflow } = require('./workflow-yaml-test-helper.js');
  const workflow = readWorkflow('supabase-baseline.yaml');
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.seed_image_catalog, {
    description: 'Reviewed image catalog for main-only seeding',
    type: 'choice',
    default: 'current',
    options: ['current', 'cli-2.121.0'],
  });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const seed = workflow.jobs['seed-images'];
  assert.equal(
    seed.if,
    "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.seed_images_only == true"
  );
  assert.equal(seed.strategy['max-parallel'], 1);
  assert.deepEqual(seed.strategy.matrix.profile, [
    'contract',
    'contract-http',
    'full',
  ]);
  const checkout = seed.steps.find((step) =>
    step.uses.startsWith('actions/checkout')
  );
  assert.equal(checkout.with, undefined);
  const cache = seed.steps.find(
    (step) => step.uses === './.github/actions/cache-supabase-images'
  );
  assert.equal(cache.with['pull-budget-seconds'], '600');
  assert.equal(
    cache.with['seed-image-catalog'],
    `${String.fromCharCode(36)}{{ inputs.seed_image_catalog || 'current' }}`
  );
  for (const job of Object.values(workflow.jobs).filter((job) => job !== seed))
    for (const step of job.steps || [])
      assert.equal(step.with?.['seed-image-catalog'], undefined);
});
