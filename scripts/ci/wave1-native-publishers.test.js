const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const sha = 'a'.repeat(40);
const root = path.resolve(__dirname, '../..');
const modules = Promise.all([
  import('./wave1-native-profile.mjs'),
  import('./wave1-native-artifact.mjs'),
  import('./wave1-native-publish.mjs'),
]);
const { fixture } = require('./wave1-native-test-fixture.cjs');
for (const app of ['calendar', 'mail', 'apps']) {
  for (const env of ['staging', 'production']) {
    test(`${app} ${env} has an explicit isolated reviewed profile and relocatable seal`, async (t) => {
      const [{ profileFor }, { prepare, verify }] = await modules;
      const dir = fixture(t, app);
      const p = profileFor(app, env, 'owner-example');
      const receipt = prepare(dir, app, env, 'owner-example', sha);
      const { config } = verify(dir, app, env, sha);
      const emitted = JSON.parse(fs.readFileSync(config));
      assert.equal(p.accountId, 'e8912e2867beecc673d171907bf09649');
      assert.equal(emitted.name, p.name);
      assert.equal(emitted.workers_dev, false);
      assert.deepEqual(emitted.routes, []);
      assert.ok(receipt.files['server/index.js']);
      assert.deepEqual(emitted.secrets.required, p.secrets);
      assert.equal(emitted.services, undefined);
      assert.equal(emitted.r2_buckets, undefined);
      if (app === 'apps')
        assert.equal(
          emitted.vars.APPS_CANONICAL_HOST_ENABLED,
          env === 'production' ? '1' : '0'
        );
      const relocated = `${dir}-restore`;
      t.after(() => fs.rmSync(relocated, { recursive: true, force: true }));
      fs.mkdirSync(relocated);
      const archive = path.join(dir, 'native.tar.gz');
      execFileSync(
        'python3',
        ['scripts/ci/wave1-native-archive.py', 'pack', dir, archive],
        { cwd: root }
      );
      execFileSync(
        'python3',
        ['scripts/ci/wave1-native-archive.py', 'restore', relocated, archive],
        { cwd: root }
      );
      assert.deepEqual(verify(relocated, app, env, sha).receipt, receipt);
    });
  }
}
for (const mutation of [
  'module',
  'profile',
  'additional-file',
  'source-sha',
  'symlink',
]) {
  test(`artifact gate rejects ${mutation} drift before publication`, async (t) => {
    const [, { prepare, verify }] = await modules;
    const dir = fixture(t);
    prepare(dir, 'mail', 'staging', 'owner-example', sha);
    if (mutation === 'module')
      fs.appendFileSync(path.join(dir, 'dist/server/index.js'), '\n// drift');
    if (mutation === 'profile')
      fs.appendFileSync(path.join(dir, 'dist/wave1/wrangler.json'), '\n');
    if (mutation === 'additional-file')
      fs.writeFileSync(path.join(dir, 'dist/new.js'), 'drift');
    if (mutation === 'symlink')
      fs.symlinkSync('/etc/passwd', path.join(dir, 'dist/foreign'));
    assert.throws(() =>
      verify(
        dir,
        'mail',
        'staging',
        mutation === 'source-sha' ? 'b'.repeat(40) : sha
      )
    );
  });
}
for (const resource of [
  'routes',
  'kv_namespaces',
  'r2_buckets',
  'services',
  'durable_objects',
  'queues',
]) {
  test(`profiles refuse unadmitted ${resource} instead of silently dropping it`, async (t) => {
    const [, { prepare }] = await modules;
    const dir = fixture(t);
    const config = path.join(dir, 'dist/server/wrangler.json');
    const base = JSON.parse(fs.readFileSync(config));
    base[resource] = [{ binding: 'FOREIGN', name: 'production-resource' }];
    fs.writeFileSync(config, JSON.stringify(base));
    assert.throws(
      () => prepare(dir, 'mail', 'staging', 'owner-example', sha),
      /Unadmitted source resource/
    );
  });
}
test('archive preflight rejects traversal and links before any restore', (t) => {
  const dir = fixture(t);
  const result = spawnSync(
    'python3',
    [
      '-c',
      `
import importlib.util, tarfile
spec=importlib.util.spec_from_file_location('archive', 'scripts/ci/wave1-native-archive.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
for name, kind in [('dist/../../escape', tarfile.REGTYPE), ('dist/link', tarfile.SYMTYPE), ('/dist/escape', tarfile.REGTYPE), ('dist/.env', tarfile.REGTYPE)]:
    member=tarfile.TarInfo(name); member.type=kind
    try: m.inspect([member]); raise AssertionError('unsafe archive admitted')
    except ValueError: pass
`,
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(dir));
});
test('hold and enable flag reject production, PRs, branch dispatch and unprovisioned staging', async () => {
  const [, , { publicationAdmission }] = await modules;
  for (const event of ['push', 'workflow_dispatch', 'pull_request']) {
    assert.deepEqual(
      publicationAdmission({
        environment: 'production',
        ref: 'refs/heads/production',
        event,
        stagingEnabled: 'true',
      }),
      { allowed: false, reason: 'held for wave-1 cutover' }
    );
  }
  for (const [ref, event, enabled] of [
    ['refs/heads/main', 'push', 'false'],
    ['refs/heads/feature', 'workflow_dispatch', 'true'],
    ['refs/pull/1/merge', 'pull_request', 'true'],
  ]) {
    assert.equal(
      publicationAdmission({
        environment: 'staging',
        ref,
        event,
        stagingEnabled: enabled,
      }).allowed,
      false
    );
  }
  assert.equal(
    publicationAdmission({
      environment: 'staging',
      ref: 'refs/heads/main',
      event: 'push',
      stagingEnabled: 'true',
      app: 'mail',
      sha,
      admissionRecord: JSON.stringify({
        schema: 1,
        app: 'mail',
        sourceSha: sha,
        artifactSha256: 'a'.repeat(64),
        ...JSON.parse(
          fs.readFileSync(
            path.join(root, 'scripts/ci/wave1-native-profiles.json')
          )
        ).stagingAdmission,
      }),
    }).allowed,
    true
  );
});
test('production policy CLI reports hold without loading artifact or provider credentials', () => {
  const result = execFileSync(
    'node',
    [
      'scripts/ci/wave1-native-publish.mjs',
      'policy',
      'mail',
      'production',
      sha,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REF: 'refs/heads/production',
        GITHUB_EVENT_NAME: 'push',
        GITHUB_OUTPUT: '',
      },
    }
  );
  assert.match(result, /held for wave-1 cutover/);
});
for (const phase of ['stopped', 'verify', 'write', 'accept', 'success']) {
  test(`one-shot publication bounds writes and preserves ${phase} outcome`, async () => {
    const [, , { guardedPublication }] = await modules;
    const record = { state: 'preflight' };
    let writes = 0,
      accepts = 0;
    const run = () =>
      guardedPublication({
        enabled: async () => {
          if (phase === 'stopped') throw new Error('stopped');
        },
        validate: () => {
          if (phase === 'verify') throw new Error('seal');
        },
        write: async () => {
          writes++;
          if (phase === 'write') throw new Error('unknown outcome');
          return 'v1';
        },
        accept: async () => {
          accepts++;
          if (phase === 'accept') throw new Error('hosted rejection');
        },
        save: () => {},
        record,
      });
    if (phase === 'success') await run();
    else await assert.rejects(run());
    assert.equal(writes, ['stopped', 'verify'].includes(phase) ? 0 : 1);
    assert.equal(accepts, ['accept', 'success'].includes(phase) ? 1 : 0);
    assert.equal(
      record.state,
      ['stopped', 'verify'].includes(phase)
        ? 'preflight'
        : phase === 'write'
          ? 'publication-attempted'
          : phase === 'accept'
            ? 'published-awaiting-acceptance'
            : 'accepted'
    );
  });
}
test('rerun recognizes exact artifact tag and SHA, never source SHA alone', async () => {
  const [, , { matchesVersion }] = await modules;
  const version = {
    annotations: { 'workers/message': sha, 'workers/tag': 'digest' },
  };
  assert.equal(matchesVersion(version, sha, 'digest'), true);
  assert.equal(matchesVersion(version, sha, 'different-bytes'), false);
  assert.equal(matchesVersion(version, 'b'.repeat(40), 'digest'), false);
});
test('rollback requires an existing complete deployment and retains weighted versions', async () => {
  const [, , { requireRollback }] = await modules;
  assert.throws(() => requireRollback([]));
  const versions = [
    { version_id: '12345678-1234-1234-1234-123456789012', percentage: 100 },
  ];
  assert.deepEqual(
    requireRollback([{ id: 'deployment', versions }]).versions,
    versions
  );
  assert.throws(() =>
    requireRollback([
      { id: 'deployment', versions: [{ ...versions[0], percentage: 50 }] },
    ])
  );
});
test('control-plane reads refuse redirects and oversized responses with one request', async () => {
  const [, , { boundedJson }] = await modules;
  let calls = 0;
  await assert.rejects(
    () =>
      boundedJson('https://example.invalid', 'fixture', async (_, options) => {
        calls++;
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal);
        return new Response('x'.repeat(1024 * 1024 + 1));
      }),
    /exceeded budget/
  );
  assert.equal(calls, 1);
});
test('original, restored and publication jobs cannot bypass seal/runtime or policy', () => {
  const workflow = readWorkflow('wave1-native-app.yaml');
  assert.equal(workflow.jobs['publish-production'], undefined);
  assert.ok(workflow.jobs['policy-production']);
  assert.deepEqual(workflow.jobs.build.strategy.matrix.profile, [
    'staging',
    'production',
  ]);
  for (const name of ['build', 'restored'])
    assert.ok(
      workflow.jobs[name].steps.some((step) =>
        step.run?.includes('wave1-native-runtime.mjs')
      )
    );
  const publish = readWorkflow('wave1-native-publish.yaml');
  assert.equal(publish.concurrency['cancel-in-progress'], false);
  const runtime = publish.jobs.publish.steps.findIndex((step) =>
    step.run?.includes('wave1-native-runtime.mjs')
  );
  const write = publish.jobs.publish.steps.findIndex((step) =>
    step.run?.includes('wave1-native-publish.mjs publish')
  );
  const marker = publish.jobs.publish.steps.findIndex((step) =>
    step.run?.includes('record-deployment-marker.ts')
  );
  assert.ok(runtime < write && write < marker);
  assert.equal(publish.jobs.publish.steps[runtime].env, undefined);
  assert.ok(publish.jobs.publish.steps[write].env.CLOUDFLARE_STAGING_API_TOKEN);
});
test('Meet staging profile isolates frontend, realtime, DO namespaces and R2', () => {
  const result = JSON.parse(
    execFileSync(
      'bun',
      [
        '--eval',
        `
    import { meetStagingConfig } from './apps/meet/void.staging.config.ts';
    console.log(JSON.stringify(meetStagingConfig().cloudflare));
  `,
      ],
      {
        cwd: root,
        env: { ...process.env, CLOUDFLARE_WORKERS_SUBDOMAIN: 'owner-example' },
        encoding: 'utf8',
      }
    )
  );
  assert.equal(result.name, 'tuturuuu-meet-wave1-staging');
  assert.equal(
    result.images,
    undefined,
    'Account-level production Images access is not admitted'
  );
  assert.deepEqual(result.routes, []);
  assert.equal(result.workers_dev, false);
  assert.equal(result.preview_urls, false);
  assert.equal(result.services[0].service, result.name);
  assert.equal(
    result.r2_buckets[0].bucket_name,
    'tuturuuu-meet-wave1-staging-cache'
  );
  assert.ok(
    result.vars.MEET_REALTIME_URL.includes(
      'tuturuuu-meet-realtime-wave1-staging.'
    )
  );
  const realtime = JSON.parse(
    fs.readFileSync(
      path.join(root, 'apps/meet-realtime/wrangler.staging.jsonc')
    )
  );
  assert.equal(realtime.name, 'tuturuuu-meet-realtime-wave1-staging');
  assert.deepEqual(realtime.routes, []);
  assert.equal(realtime.workers_dev, false);
  assert.equal(realtime.preview_urls, false);
  assert.ok(
    realtime.durable_objects.bindings.every((binding) => !binding.script_name)
  );
  const production = JSON.parse(
    execFileSync(
      'bun',
      [
        '--eval',
        `
    import config from './apps/meet/void.config.ts';
    console.log(JSON.stringify(config.cloudflare));
  `,
      ],
      {
        cwd: root,
        env: { ...process.env, MEET_DEPLOYMENT_PROFILE: '' },
        encoding: 'utf8',
      }
    )
  );
  const productionRealtime = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/meet-realtime/wrangler.jsonc'))
  );
  const forbidden = [
    production.name,
    productionRealtime.name,
    ...production.r2_buckets.map((bucket) => bucket.bucket_name),
    ...production.routes.map((route) => route.pattern),
    ...productionRealtime.routes.map((route) => route.pattern),
  ];
  const inspect = (value) => {
    if (typeof value === 'string') {
      const identity = /^(https?|wss?):/.test(value)
        ? new URL(value).hostname
        : value;
      assert.ok(
        !forbidden.includes(identity),
        `Production identity in staging: ${identity}`
      );
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) inspect(item);
    }
  };
  inspect(result);
  inspect(realtime);
});
test('Worker build-info is public, read-only, exact-path and retains app identity', () => {
  const value = JSON.parse(
    execFileSync(
      'bun',
      [
        '--eval',
        `
    import { workerBuildInfo } from './packages/utils/src/worker-build-info.ts';
    const result = [];
    for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS']) {
      const response = workerBuildInfo(new Request('https://example.invalid/api/build-info', { method }), 'mail');
      result.push({ method, status: response.status, body: await response.text(), cache: response.headers.get('cache-control') });
    }
    if (workerBuildInfo(new Request('https://example.invalid/api/build-info/extra'), 'mail') !== null) throw new Error('path escape');
    console.log(JSON.stringify(result));
  `,
      ],
      { cwd: root, encoding: 'utf8' }
    )
  );
  assert.deepEqual(
    value.map((v) => v.status),
    [200, 200, 405, 204]
  );
  assert.equal(JSON.parse(value[0].body).appName, 'mail');
  assert.equal(value[1].body, '');
  assert.match(value[0].cache, /no-store/);
});

for (const environment of ['staging', 'production']) {
  test(`Mail ${environment} refuses emitted CommonJS builtin requires before runtime startup`, async (t) => {
    const [, { prepare }] = await modules;
    for (const expression of [
      'require("path")',
      '__require("node:path")',
      '__require$1("path")',
      'require("fs")',
      '__require("url")',
      'require("stream")',
      '__require$1("stream")',
      'require("node:stream")',
      'require("node:buffer")',
      '__require("node:buffer")',
      '__require2(`node:crypto`)',
      '__require$1(`buffer`)',
    ]) {
      const dir = fixture(t);
      fs.mkdirSync(path.join(dir, 'dist/server/assets'));
      fs.writeFileSync(
        path.join(dir, 'dist/server/assets/failed-recipients.js'),
        `const path = ${expression};`
      );
      assert.throws(
        () => prepare(dir, 'mail', environment, 'owner-example', sha),
        /CommonJS Node builtin require/
      );
    }
  });
}

test('Mail staging and production preserve native compatibility and bundling unchanged', async (t) => {
  const [, { prepare, verify }] = await modules;
  const configs = ['staging', 'production'].map((environment) => {
    const dir = fixture(t);
    prepare(dir, 'mail', environment, 'owner-example', sha);
    return JSON.parse(
      fs.readFileSync(verify(dir, 'mail', environment, sha).config)
    );
  });
  for (const key of [
    'compatibility_date',
    'compatibility_flags',
    'no_bundle',
    'rules',
  ]) {
    assert.deepEqual(configs[0][key], configs[1][key], key);
  }
  assert.deepEqual(configs[0].compatibility_flags, [
    'nodejs_compat',
    'global_fetch_strictly_public',
  ]);
  assert.equal(configs[0].compatibility_date, '2026-10-19');
});

test('Calendar coordination fallback is optional while Mail and Apps still require their key', async (t) => {
  const [{ profiles }, { prepare, verify }] = await modules;
  for (const app of ['calendar', 'mail', 'apps']) {
    const root = fixture(t, app);
    prepare(root, app, 'staging', 'owner-example', sha);
    const { config } = verify(root, app, 'staging', sha);
    const emitted = JSON.parse(fs.readFileSync(config));
    assert.equal(
      emitted.secrets.required.includes('TUTURUUU_APP_COORDINATION_SECRET'),
      app !== 'calendar',
      `${app} coordination requirement must match its accepted fallback contract`
    );
  }
  assert.ok(
    profiles.apps.calendar.optionalSecretNames.includes(
      'TUTURUUU_APP_COORDINATION_SECRET'
    )
  );
});
