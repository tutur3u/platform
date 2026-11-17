const test = require('node:test');
const assert = require('node:assert/strict');
const {
  main,
  identity,
  mirrorFor,
  saveAllowed,
  failureReport,
} = require('./web-e2e-supabase-cache');
const { catalogPin, digestReference } = require('./supabase-image-cache-seed');
const { MAX_ARCHIVE_BYTES } = require('./supabase-image-cache');
const data = require('./supabase-image-cache-seed-data.json');
const config =
  ['api', 'auth', 'realtime', 'studio', 'inbucket', 'storage']
    .map((section) => `[${section}]\nenabled = true\n`)
    .join('') +
  ['edge_runtime', 'analytics', 'db.pooler']
    .map((section) => `[${section}]\nenabled = false\n`)
    .join('');
const images = Object.keys(data.catalogs['cli-2.121.0'].images);
const services = images.map((image) => ({
  name: `supabase/${image.split('/').at(-1).split(':')[0]}`,
  local: image.split(':').at(-1),
}));
const inputs = {
  services,
  cliVersion: '2.121.0',
  config,
  lock: 'lock',
  platform: 'linux',
  arch: 'x64',
};
function environment(patch = {}) {
  return {
    CI: 'true',
    GITHUB_REPOSITORY: 'tutur3u/platform',
    GITHUB_WORKFLOW_REF:
      'tutur3u/platform/.github/workflows/e2e-smoke-report-only.yaml@refs/heads/main',
    GITHUB_REF: 'refs/heads/main',
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_ACTOR: 'owner',
    RUNNER_TEMP: '/owned',
    GITHUB_OUTPUT: '/output',
    GITHUB_ENV: '/env',
    ...patch,
  };
}
function fixture(patch = {}) {
  const files = new Map();
  const calls = [];
  const removed = [];
  const env = environment(patch);
  const io = {
    readFileSync(file) {
      if (file.endsWith('bun.lock')) return inputs.lock;
      if (file.endsWith('config.toml')) return config;
      if (!files.has(file)) throw new Error('missing fixture');
      return files.get(file);
    },
    writeFileSync(file, value, settings) {
      calls.push(['write', file, settings]);
      files.set(file, value);
    },
    appendFileSync(file, value) {
      files.set(file, (files.get(file) || '') + value);
    },
    chmodSync(file, mode) {
      calls.push(['chmod', file, mode]);
    },
    mkdirSync(file, settings) {
      calls.push(['mkdir', file, settings]);
      files.set(file, '');
    },
    existsSync: (file) => files.has(file),
    unlinkSync(file) {
      removed.push(file);
      files.delete(file);
    },
    rmdirSync(file) {
      removed.push(file);
      files.delete(file);
    },
    statSync: () => ({ size: 1024 }),
    statfsSync: () => ({ bavail: 10 * 1024 ** 3, bsize: 1 }),
  };
  const spawn = (name, args, settings) => {
    calls.push([name, args, settings]);
    if (args[0] === 'tag')
      assert.ok(
        !args[2].includes('@'),
        'Docker tag target must be a tag, not a digest reference'
      );
    if (args.includes('--version'))
      return { status: 0, stdout: inputs.cliVersion };
    if (args.includes('services'))
      return { status: 0, stdout: JSON.stringify(services) };
    if (args[0] === 'save')
      files.set('/owned/web-e2e-supabase-images/images.tar', 'tar');
    if (args.includes('{{.Size}}')) return { status: 0, stdout: '1024' };
    if (args[0] === 'image') {
      const image = args.at(-1);
      const canonical = identity(inputs).images.find((item) => {
        const pin = catalogPin('cli-2.121.0', item);
        const mirror = mirrorFor(item, pin);
        return (
          item === image ||
          digestReference(item, pin) === image ||
          (mirror && `${mirror.repository}@${mirror.amd64}` === image)
        );
      });
      const pin = catalogPin('cli-2.121.0', canonical);
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            Os: 'linux',
            Architecture: 'amd64',
            Id: pin.config,
            RepoDigests: [
              image.includes('@') ? image : digestReference(image, pin),
            ],
          },
        ]),
      };
    }
    return { status: 0, stdout: 'never print tool output' };
  };
  const options = {
    env,
    fs: io,
    spawn,
    platform: 'linux',
    arch: 'x64',
    now: () => 0,
  };
  return { env, io, files, calls, removed, options };
}
test('admission refuses local, fork and PR contexts before filesystem or command access', async () => {
  for (const patch of [
    { CI: '' },
    { GITHUB_REPOSITORY: 'fork/platform' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/pull/1/merge' },
  ]) {
    const f = fixture(patch);
    await assert.rejects(main('login', f.options), /trusted main/);
    assert.deepEqual(f.calls, []);
    assert.equal(f.files.size, 0);
  }
});
test('identity binds lock, config, CLI, platform and every selected pin without run identity', () => {
  const original = identity(inputs).digest;
  assert.match(original, /^[a-f0-9]{64}$/);
  for (const patch of [
    { lock: 'other' },
    { config: `${config}\n# revision` },
    { platform: 'other' },
    { arch: 'arm64' },
  ]) {
    assert.notEqual(identity({ ...inputs, ...patch }).digest, original);
  }
  assert.throws(() => identity({ ...inputs, cliVersion: '0.0.0' }));
  const pin = catalogPin('cli-2.121.0', identity(inputs).images[0]);
  const old = pin.config;
  try {
    pin.config = `sha256:${'0'.repeat(64)}`;
    assert.notEqual(identity(inputs).digest, original);
  } finally {
    pin.config = old;
  }
  assert.equal(
    identity({ ...inputs, GITHUB_RUN_ID: '999', GITHUB_RUN_ATTEMPT: '8' })
      .digest,
    original
  );
});
test('key creates private current metadata and emits only the digest', async () => {
  const f = fixture();
  await main('key', f.options);
  assert.match(f.files.get('/output'), /^digest=[a-f0-9]{64}\n$/);
  assert.ok(
    f.calls.some(
      ([op, file, settings]) =>
        op === 'write' &&
        file.endsWith('metadata.json') &&
        settings.mode === 0o600
    )
  );
});
test('invalid environment paths stop before writes and retain a fixed phase', async () => {
  const f = fixture({ RUNNER_TEMP: '/owned\nINJECTED=value' });
  await assert.rejects(main('key', f.options), {
    message: 'E2E_IMAGES_TEMP',
    phase: 'context-validation',
  });
  assert.deepEqual(f.calls, []);
});
test('restored archive requires correct content and platform and is removed after load', async () => {
  for (const patch of [
    { Id: 'wrong' },
    { Architecture: 'arm64' },
    { Os: 'windows' },
    {},
  ]) {
    const f = fixture({ IMAGE_CACHE_HIT: 'true' });
    await main('key', f.options);
    const archive = '/owned/web-e2e-supabase-images/images.tar';
    f.files.set(archive, 'tar');
    const original = f.options.spawn;
    f.options.spawn = (name, args, settings) => {
      const result = original(name, args, settings);
      if (args[0] === 'image')
        result.stdout = JSON.stringify([
          { ...JSON.parse(result.stdout)[0], ...patch },
        ]);
      return result;
    };
    if (Object.keys(patch).length)
      await assert.rejects(main('prepare', f.options), /digest mismatch/);
    else await main('prepare', f.options);
    assert.ok(f.removed.includes(archive));
  }
});
test('oversized archive is refused before Docker load and removed', async () => {
  const f = fixture({ IMAGE_CACHE_HIT: 'true' });
  await main('key', f.options);
  f.files.set('/owned/web-e2e-supabase-images/images.tar', 'tar');
  f.io.statSync = () => ({ size: MAX_ARCHIVE_BYTES + 1 });
  await assert.rejects(main('prepare', f.options), /ARCHIVE_SIZE/);
  assert.ok(
    !f.calls.some(([name, args]) => name === 'docker' && args[0] === 'load')
  );
});
test('mirror qualification requires canonical manifest and config equality', () => {
  const image = identity(inputs).images.find((item) =>
    mirrorFor(item, catalogPin('cli-2.121.0', item))
  );
  const pin = catalogPin('cli-2.121.0', image);
  assert.match(mirrorFor(image, pin).repository, /^ghcr.io\/supabase\//);
  assert.equal(mirrorFor(image, { ...pin, config: 'wrong' }), null);
  assert.equal(mirrorFor(image, { ...pin, amd64: 'wrong' }), null);
});
test('mirror failure gets one bounded canonical fallback with strict pins and no generic trust override', async () => {
  const f = fixture({ GITHUB_EVENT_NAME: 'schedule' });
  await main('key', f.options);
  const pulls = [];
  f.options.pullImage = async (image, settings) => {
    pulls.push({ image, settings });
    return { code: image.startsWith('ghcr.io') ? 1 : 0 };
  };
  await main('prepare', f.options);
  assert.ok(pulls.some(({ image }) => image.startsWith('ghcr.io')));
  for (const { image, settings } of pulls) {
    assert.equal(settings.seedContext, undefined);
    assert.ok(settings.deadline <= 120_000);
    assert.equal(settings.budget, 120_000);
    assert.ok(settings.pin.config.startsWith('sha256:'));
    assert.equal(
      settings.retryOptions.maxAttempts,
      image.startsWith('ghcr.io') ? 1 : 2
    );
  }
  assert.ok(
    !f.calls.some(([name, args]) => name === 'docker' && args[0] === 'save')
  );
});
test('real pull helper verifies registry digest before tagging mirror content', async () => {
  const f = fixture({ GITHUB_EVENT_NAME: 'schedule' });
  await main('key', f.options);
  await main('prepare', f.options);
  const pulls = f.calls.filter(
    ([name, args]) => name === 'docker' && args[0] === 'pull'
  );
  assert.equal(pulls.length, identity(inputs).images.length);
  assert.ok(
    pulls.every(
      ([, args, settings]) =>
        args.includes('--platform') &&
        /@sha256:[a-f0-9]{64}$/.test(args.at(-1)) &&
        settings.timeout <= 90_000
    )
  );
  assert.ok(
    f.calls.some(
      ([name, args]) =>
        name === 'docker' && args[0] === 'tag' && args[1].startsWith('ghcr.io/')
    )
  );
});
test('real pull helper refuses same-config content without registry digest proof', async () => {
  const f = fixture({ GITHUB_EVENT_NAME: 'schedule' });
  await main('key', f.options);
  const original = f.options.spawn;
  f.options.spawn = (name, args, settings) => {
    const result = original(name, args, settings);
    if (args[0] === 'image')
      result.stdout = JSON.stringify([
        { ...JSON.parse(result.stdout)[0], RepoDigests: [] },
      ]);
    return result;
  };
  await assert.rejects(main('prepare', f.options), /E2E_IMAGES_PULL/);
  assert.ok(
    !f.calls.some(([name, args]) => name === 'docker' && args[0] === 'tag')
  );
});
test('login uses private config and token stdin without propagating tool output; cleanup removes only owned files', async () => {
  const f = fixture({ GHCR_TOKEN: 'synthetic-token' });
  await main('login', f.options);
  const login = f.calls.find(
    ([name, args]) => name === 'docker' && args[0] === 'login'
  );
  assert.equal(login[2].input, 'synthetic-token');
  assert.ok(!login[1].join(' ').includes('synthetic-token'));
  assert.equal(login[2].env.GHCR_TOKEN, '');
  assert.match(f.files.get('/env'), /^DOCKER_CONFIG=\/owned\//);
  assert.ok(!f.files.get('/env').includes('token'));
  f.files.set('/foreign/config.json', 'preserve');
  await main('cleanup', f.options);
  assert.equal(f.files.get('/foreign/config.json'), 'preserve');
  assert.deepEqual(f.removed, [
    '/owned/web-e2e-supabase-registry-auth/config.json',
    '/owned/web-e2e-supabase-registry-auth',
  ]);
});
test('archive export is limited to explicit main push and adequate disk', async () => {
  for (const patch of [
    {},
    { GITHUB_EVENT_NAME: 'schedule' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_ACTOR: 'dependabot[bot]' },
  ]) {
    const f = fixture(patch);
    await main('key', f.options);
    f.options.pullImage = async () => ({ code: 0 });
    await main('prepare', f.options);
    assert.equal(
      f.files.get('/output').includes('archive-ready=true'),
      saveAllowed(f.env)
    );
  }
  const f = fixture();
  await main('key', f.options);
  f.options.pullImage = async () => ({ code: 0 });
  f.io.statfsSync = () => ({ bavail: 1, bsize: 1 });
  await main('prepare', f.options);
  assert.ok(!f.files.get('/output').includes('archive-ready=true'));
});
test('optional archive export failures do not block validated runtime images', async () => {
  for (const failure of [
    'large-images',
    'large-archive',
    'save-failed',
    'disk-inspect-failed',
    'size-inspect-failed',
  ]) {
    const f = fixture();
    await main('key', f.options);
    f.options.pullImage = async () => ({ code: 0 });
    const original = f.options.spawn;
    f.options.spawn = (name, args, settings) => {
      if (failure === 'size-inspect-failed' && args.includes('{{.Size}}'))
        return { status: 1 };
      if (failure === 'large-images' && args.includes('{{.Size}}'))
        return { status: 0, stdout: String(MAX_ARCHIVE_BYTES) };
      if (failure === 'save-failed' && args[0] === 'save') return { status: 1 };
      return original(name, args, settings);
    };
    if (failure === 'disk-inspect-failed')
      f.io.statfsSync = () => {
        throw new Error('disk unavailable');
      };
    if (failure === 'large-archive')
      f.io.statSync = () => ({ size: MAX_ARCHIVE_BYTES + 1 });
    await assert.doesNotReject(main('prepare', f.options));
    assert.ok(!f.files.get('/output').includes('archive-ready=true'));
    assert.equal(
      f.files.has('/owned/web-e2e-supabase-images/images.tar'),
      false
    );
  }
});
test('checkout metadata changes fail closed before loading an archive', async () => {
  const f = fixture({ IMAGE_CACHE_HIT: 'true' });
  await main('key', f.options);
  f.files.set('/owned/web-e2e-supabase-images/metadata.json', '{}');
  await assert.rejects(main('prepare', f.options), /E2E_IMAGES_METADATA/);
  assert.ok(!f.calls.some(([name]) => name === 'docker'));
});
test('preparation deadline stops subsequent Docker operations', async () => {
  const f = fixture({ GITHUB_EVENT_NAME: 'schedule' });
  await main('key', f.options);
  let time = 0;
  f.options.now = () => time;
  f.options.pullImage = async () => {
    time = 120_001;
    return { code: 1 };
  };
  await assert.rejects(main('prepare', f.options), /E2E_IMAGES_DEADLINE/);
  assert.ok(!f.calls.some(([name]) => name === 'docker'));
});
test('login errors discard credential-bearing child output and cleanup still works', async () => {
  const f = fixture({ GHCR_TOKEN: 'synthetic-token' });
  f.options.spawn = () => ({
    status: 1,
    stdout: 'synthetic-token',
    stderr: 'synthetic-token',
  });
  await assert.rejects(main('login', f.options), {
    message: 'E2E_IMAGES_LOGIN',
  });
  await main('cleanup', f.options);
  assert.equal(
    f.files.has('/owned/web-e2e-supabase-registry-auth/config.json'),
    false
  );
});
test('pull failures report only catalog identity and bounded classification, never child diagnostics', async () => {
  const secret = 'synthetic-private-pull-output';
  for (const [failure, result] of [
    ['authentication', { status: 1, stderr: `unauthorized ${secret}` }],
    ['rate-limit', { status: 1, stderr: `HTTP 429 ${secret}` }],
    ['manifest', { status: 1, stderr: `manifest unknown ${secret}` }],
    [
      'daemon-unavailable',
      { status: 1, stderr: `Cannot connect to the Docker daemon ${secret}` },
    ],
    [
      'timeout',
      { status: null, error: { code: 'ETIMEDOUT', message: secret } },
    ],
    [
      'output-limit',
      { status: null, error: { code: 'ENOBUFS', message: secret } },
    ],
    [
      'command-unavailable',
      { status: null, error: { code: 'ENOENT', message: secret } },
    ],
    ['process-failure', { status: 1, stderr: secret }],
  ]) {
    const f = fixture({ GHCR_TOKEN: secret });
    await main('key', f.options);
    const original = f.options.spawn;
    f.options.spawn = (name, args, settings) =>
      args[0] === 'pull'
        ? { ...result, stdout: secret }
        : original(name, args, settings);
    f.options.pullImage = async (image, settings) => {
      for (
        let attempt = 0;
        attempt < settings.retryOptions.maxAttempts;
        attempt++
      )
        settings.spawn('docker', ['pull', image]);
      return { code: 1, stderr: secret };
    };
    await assert.rejects(main('prepare', f.options), (error) => {
      const image = identity(inputs).images[0];
      assert.deepEqual(failureReport(error), {
        code: 'E2E_IMAGES_PULL',
        phase: 'image-pull',
        imagePull: {
          image,
          transport: 'canonical',
          operation: 'pull',
          attempts: mirrorFor(image, catalogPin('cli-2.121.0', image)) ? 3 : 2,
          failure,
        },
      });
      assert.ok(!JSON.stringify(failureReport(error)).includes(secret));
      assert.ok(!f.files.get('/output').includes(secret));
      return true;
    });
  }
});
test('successful inspect followed by pin rejection remains verification, without exposing content', async () => {
  const f = fixture({ GITHUB_EVENT_NAME: 'schedule' });
  await main('key', f.options);
  const original = f.options.spawn;
  f.options.spawn = (name, args, settings) => {
    const result = original(name, args, settings);
    if (args[0] === 'image') result.stdout = 'untrusted-private-invalid-json';
    return result;
  };
  await assert.rejects(main('prepare', f.options), (error) => {
    const report = failureReport(error);
    assert.equal(report.code, 'E2E_IMAGES_PULL');
    assert.equal(report.imagePull.operation, 'inspect');
    assert.equal(report.imagePull.failure, 'verification');
    assert.equal(report.imagePull.transport, 'canonical');
    assert.ok(
      !JSON.stringify(report).includes('untrusted-private-invalid-json')
    );
    return true;
  });
});
test('reporter excludes unvalidated fields and forged image identities', () => {
  const report = failureReport({
    message: 'untrusted-private-message',
    phase: 'image-pull',
    imagePull: {
      image: 'https://untrusted.invalid/private',
      transport: 'canonical',
      operation: 'pull',
      attempts: 1,
      failure: 'process-failure',
      stderr: 'untrusted-private-output',
    },
  });
  assert.deepEqual(report, { code: 'E2E_IMAGES_FAILED', phase: 'image-pull' });
});
test('canonical tagging failure retains its operation without retaining Docker output', async () => {
  const f = fixture({ GITHUB_EVENT_NAME: 'schedule' });
  await main('key', f.options);
  const original = f.options.spawn;
  f.options.spawn = (name, args, settings) =>
    args[0] === 'tag'
      ? { status: 1, stderr: 'untrusted-private-tag-output' }
      : original(name, args, settings);
  await assert.rejects(main('prepare', f.options), (error) => {
    const report = failureReport(error);
    assert.equal(report.imagePull.operation, 'tag');
    assert.equal(report.imagePull.failure, 'process-failure');
    assert.equal(report.imagePull.transport, 'canonical');
    assert.ok(!JSON.stringify(report).includes('untrusted-private-tag-output'));
    return true;
  });
});
test('workflow restores only the tar and saves with the same exact platform key before auth cleanup and smoke', () => {
  const workflow = require('node:fs').readFileSync(
    require('node:path').resolve(
      __dirname,
      '../../.github/workflows/e2e-smoke-report-only.yaml'
    ),
    'utf8'
  );
  const section = workflow.slice(
    workflow.indexOf('      - name: Derive pinned E2E Supabase image identity'),
    workflow.indexOf('      - name: Smoke (')
  );
  const key =
    'key: web-e2e-supabase-v1-${{ runner.os }}-${{ runner.arch }}-${{ steps.supabase-images-identity.outputs.digest }}';
  assert.equal(section.split(key).length - 1, 2);
  assert.equal(
    section.split('path: ${{ runner.temp }}/web-e2e-supabase-images/images.tar')
      .length - 1,
    2
  );
  assert.ok(!section.includes('restore-keys:'));
  assert.match(
    section,
    /github\.event_name == 'push'.*github\.actor != 'dependabot\[bot\]'.*archive-ready == 'true'/
  );
  assert.match(section, /GHCR_TOKEN: \$\{\{ github.token \}\}/);
  assert.match(
    section,
    /Remove owned image archive and registry credentials\n        if: always\(\)/
  );
  assert.match(workflow, /permissions:\n  contents: read\n  packages: read/);
});
