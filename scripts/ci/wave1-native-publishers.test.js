const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
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
function fixture(t, app = 'mail') {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'wave1-artifact-'))
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const sub of ['dist/server', 'dist/client/assets', '.wrangler/deploy'])
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'dist/server/index.js'),
    'export default { fetch() { return new Response("fixture"); } };'
  );
  fs.writeFileSync(
    path.join(dir, 'dist/client/assets/app.js'),
    'console.log("fixture");'
  );
  fs.writeFileSync(
    path.join(dir, '.wrangler/deploy/config.json'),
    JSON.stringify({
      auxiliaryWorkers: [],
      configPath: '../../dist/server/wrangler.json',
    })
  );
  fs.writeFileSync(
    path.join(dir, 'dist/server/wrangler.json'),
    JSON.stringify({
      name: app === 'apps' ? 'tuturuuu-apps-vite-staging' : `tuturuuu-${app}`,
      no_bundle: true,
      main: './index.js',
      compatibility_date: app === 'apps' ? '2026-10-12' : '2026-10-19',
      compatibility_flags:
        app === 'apps'
          ? ['nodejs_compat']
          : ['nodejs_compat', 'global_fetch_strictly_public'],
      vars:
        app === 'apps'
          ? { TUTURUUU_NOINDEX: '1' }
          : app === 'mail'
            ? {
                NEXT_PUBLIC_APP_URL: 'https://mail.tuturuuu.com',
                NEXT_PUBLIC_MAIL_APP_URL: 'https://mail.tuturuuu.com',
                NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
              }
            : {},
      rules: [{ type: 'ESModule', globs: ['**/*.js'] }],
      assets: {
        directory: '../client',
        binding: 'ASSETS',
        run_worker_first: true,
        not_found_handling: 'none',
      },
    })
  );
  return dir;
}
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
      assert.equal(emitted.workers_dev, env === 'staging');
      assert.deepEqual(
        emitted.routes,
        env === 'staging' ? [] : [{ pattern: p.host, custom_domain: true }]
      );
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
  assert.deepEqual(workflow.jobs['publish-production'].needs, [
    'restored',
    'policy-production',
  ]);
  assert.equal(
    workflow.jobs['publish-production'].if,
    "needs.policy-production.outputs.allowed == 'true'"
  );
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
  assert.ok(publish.jobs.publish.steps[write].env.CLOUDFLARE_API_TOKEN);
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
  assert.deepEqual(result.routes, []);
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
  assert.ok(
    realtime.durable_objects.bindings.every((binding) => !binding.script_name)
  );
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
