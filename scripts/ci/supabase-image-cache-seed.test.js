const assert = require('node:assert/strict');
const test = require('node:test');
const { pullImage } = require('./supabase-image-cache.js');
const {
  seedCatalog,
  catalogPin,
  fallbackPin,
  digestReference,
  verifyPinned,
} = require('./supabase-image-cache-seed.js');
const data = require('./supabase-image-cache-seed-data.json');
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
    ['public.ecr.aws/supabase/imgproxy:unreviewed', seedContext, 'HTTP 429', 7],
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

test('every current and retained catalog image has a matching official fallback', () => {
  const retainedImages = [
    'postgres:17.6.1.167',
    'postgres-meta:v0.99.0',
    'postgrest:v16.2',
    'gotrue:v2.196.0',
    'realtime:v2.130.0',
    'storage-api:v1.72.1',
    'studio:2026.08.24-sha-8ec45b2',
    'kong:2.8.1',
    'mailpit:v1.30.2',
    'imgproxy:v3.8.0',
  ].map((image) => `public.ecr.aws/supabase/${image}`);
  const future = data.catalogs['cli-2.121.0'].images;
  assert.deepEqual(
    Object.keys(data.fallbacks).sort(),
    [...new Set([...retainedImages, ...Object.keys(future)])].sort()
  );
  for (const [image, pin] of Object.entries(data.fallbacks)) {
    assert.equal(
      pin.repository,
      image.split(':')[0].replace('public.ecr.aws', 'ghcr.io')
    );
    for (const field of ['index', 'amd64', 'config']) {
      assert.match(pin[field], /^sha256:[a-f0-9]{64}$/);
      if (future[image]) assert.equal(pin[field], future[image][field]);
    }
  }
});

for (const [image, pin] of Object.entries(data.fallbacks)) {
  test(`${image}: throttle fallback verifies and retags canonical content`, async () => {
    const source = `${pin.repository}@${pin.amd64}`;
    const canonical = digestReference(image, pin);
    const calls = [];
    const result = await pullImage(image, {
      deadline: 100000,
      budget: 600000,
      now: () => 0,
      seedContext,
      pin,
      retryOptions: { sleepMs: async () => {}, random: () => 0 },
      spawn: (_command, args) => {
        calls.push(args);
        if (args[0] === 'image') return seedDocker(pin, source);
        return args.at(-1) === canonical
          ? { status: 1, stderr: 'HTTP 429' }
          : { status: 0 };
      },
    });
    assert.equal(result.code, 0);
    assert.deepEqual(calls, [
      ['pull', '--platform', 'linux/amd64', canonical],
      ['pull', '--platform', 'linux/amd64', source],
      ['image', 'inspect', source],
      ['tag', source, image],
    ]);
    verifyPinned(image, pin, {
      deadline: 100000,
      now: () => 0,
      spawn: () => seedDocker(pin, source),
    });
  });
}

test('canonical digest disagreement stops before the alternate pull or canonical tag', async () => {
  for (const field of ['amd64', 'config']) {
    const image = 'public.ecr.aws/supabase/kong:2.8.1';
    const calls = [];
    const result = await pullImage(image, {
      deadline: 100000,
      budget: 600000,
      now: () => 0,
      seedContext,
      pin: { ...data.fallbacks[image], [field]: `sha256:${'0'.repeat(64)}` },
      retryOptions: { sleepMs: async () => {}, random: () => 0 },
      stderr: { write() {} },
      spawn: (_command, args) => {
        calls.push(args);
        return { status: 1, stderr: 'HTTP 429' };
      },
    });
    assert.equal(result.code, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'pull');
    assert.match(calls[0].at(-1), /^public\.ecr\.aws\//);
  }
});

test('every alternate stays unavailable to untrusted and unsupported seed contexts', () => {
  for (const image of Object.keys(data.fallbacks))
    for (const patch of [
      { trusted: false },
      { budget: 120000 },
      { platform: 'darwin' },
      { arch: 'arm64' },
    ])
      assert.equal(fallbackPin(image, { ...seedContext, ...patch }), null);
  assert.equal(
    fallbackPin('public.ecr.aws/supabase/kong:unlisted', seedContext),
    null
  );
});

test('new alternates terminate on local content mismatch before tagging', async () => {
  for (const [image, pin] of Object.entries(data.fallbacks)) {
    const calls = [];
    const result = await pullImage(image, {
      deadline: 100000,
      budget: 600000,
      now: () => 0,
      seedContext,
      pin,
      retryOptions: { sleepMs: async () => {}, random: () => 0 },
      stderr: { write() {} },
      spawn: (_command, args) => {
        calls.push(args);
        if (args[0] === 'image')
          return seedDocker(pin, `${pin.repository}@${pin.amd64}`, {
            Id: `sha256:${'0'.repeat(64)}`,
          });
        return args.at(-1).startsWith('public.ecr.aws/')
          ? { status: 1, stderr: 'HTTP 429' }
          : { status: 0 };
      },
    });
    assert.equal(result.code, 1, image);
    assert.equal(calls.length, 3, image);
    assert.ok(
      calls.every((args) => args[0] !== 'tag'),
      image
    );
  }
});
