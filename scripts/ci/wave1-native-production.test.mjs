import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { productionPublicationPolicy } from '../../tuturuuu.ci.ts';
import { artifactDigest, prepare } from './wave1-native-artifact.mjs';
import { assertRouteFree, main } from './wave1-native-production.mjs';

const require = createRequire(import.meta.url);
const { fixture } = require('./wave1-native-test-fixture.cjs');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const sha = 'a'.repeat(40);
const oldId = '11111111-1111-1111-1111-111111111111';
const newId = '22222222-2222-2222-2222-222222222222';
const publicInputs = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://production-fixture.example.com',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
};

function setup(t, { admitted = true } = {}) {
  const previous = productionPublicationPolicy.calendar;
  if (admitted)
    productionPublicationPolicy.calendar = {
      state: 'admitted',
      reason: 'fixture',
      surfaces: ['frontend'],
    };
  else
    productionPublicationPolicy.calendar = {
      state: 'held',
      reason: 'fixture hold',
    };
  t.after(() => {
    productionPublicationPolicy.calendar = previous;
  });
  for (const [key, value] of Object.entries(publicInputs)) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    });
  }
  const appRoot = fixture(t, 'calendar');
  const receipt = prepare(appRoot, 'calendar', 'production', 'fixture', sha);
  const digest = artifactDigest(receipt);
  const state = {
    writes: 0,
    active: oldId,
    ids: [],
    prior: false,
    attached: false,
    duringUpload: false,
    priorMode: 'started',
    attachedRoute: false,
    publicServing: null,
    calls: [],
  };
  const env = {
    ...publicInputs,
    GITHUB_REF: 'refs/heads/production',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    PUBLICATION_ENVIRONMENT: 'wave1-calendar-production',
    GITHUB_SHA: sha,
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_RUN_ID: '123',
    GITHUB_REPOSITORY: 'fixture/repo',
    GITHUB_TOKEN: 'github-fixture',
    WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN: 'production-fixture',
    WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN: 'topology-fixture',
    RUNNER_TEMP: appRoot,
  };
  const version = (id) => ({
    id,
    annotations:
      id === newId ? { 'workers/message': sha, 'workers/tag': digest } : {},
  });
  const fetcher = async (url, options) => {
    state.calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    assert.equal(options.method, 'GET');
    if (url.startsWith('https://api.github.com/')) {
      assert.equal(options.headers.Authorization, 'Bearer github-fixture');
      if (url.includes('/jobs?')) {
        const step = {
          name: 'Upload once without attaching serving topology',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2026-10-27T00:00:00Z',
        };
        const priorJob = {
          name: 'publish',
          status: 'completed',
          conclusion: 'failure',
          steps: [step],
        };
        if (state.priorMode === 'before')
          priorJob.steps = [
            { ...step, conclusion: 'skipped', started_at: null },
          ];
        if (state.priorMode === 'unknown') priorJob.steps = [];
        return Response.json({ total_count: 1, jobs: [priorJob] });
      }
      assert.equal(
        url.includes('head_sha='),
        false,
        'Replay fence must span all source SHAs'
      );
      const run = { id: 123, head_sha: sha, head_branch: 'production' };
      return Response.json({
        total_count: state.prior ? 2 : 1,
        workflow_runs: state.prior
          ? [run, { ...run, id: 122, head_sha: 'b'.repeat(40) }]
          : [run],
      });
    }
    const topology =
      ['/domains', '/routes', '/subdomain'].some((suffix) =>
        url.endsWith(suffix)
      ) || url.includes('/zones?');
    assert.equal(
      options.headers.Authorization,
      topology ? 'Bearer topology-fixture' : 'Bearer production-fixture'
    );
    let result;
    if (url.includes('/zones?'))
      return Response.json({
        success: true,
        result_info: { total_count: 2 },
        result: ['1'.repeat(32), '2'.repeat(32)].map((id) => ({
          id,
          account: { id: receipt.profile.accountId },
        })),
      });
    if (url.endsWith('/domains'))
      result = state.attached ? [{ service: receipt.profile.name }] : [];
    else if (url.endsWith('/routes'))
      result =
        state.attachedRoute && url.includes('2'.repeat(32))
          ? [
              {
                id: 'route',
                pattern: 'other.example/*',
                script: receipt.profile.name,
              },
            ]
          : [{ id: 'unrelated', script: 'another-worker' }];
    else if (url.endsWith('/subdomain'))
      result = {
        enabled: state.publicServing === 'workers.dev',
        previews_enabled: state.publicServing === 'preview',
      };
    else if (url.endsWith('/secrets'))
      result = receipt.profile.secrets.map((name) => ({ name }));
    else if (url.endsWith('/deployments'))
      result = {
        deployments: [
          {
            id: 'deployment',
            versions: [{ version_id: state.active, percentage: 100 }],
          },
          ...(state.noRollbackHistory
            ? []
            : [
                {
                  id: 'older-deployment',
                  versions: [{ version_id: oldId, percentage: 100 }],
                },
              ]),
        ],
      };
    else if (url.endsWith('/versions?per_page=100'))
      result = { items: state.ids.map((id) => ({ id })) };
    else if (/\/versions\/[a-f0-9-]+$/.test(url))
      result = version(url.split('/').at(-1));
    else throw new Error('Unexpected request');
    return Response.json({ success: true, result });
  };
  const exec = (command, args, options) => {
    state.writes++;
    assert.equal(command, 'bun');
    assert.equal(args.includes('deploy'), true);
    const config = JSON.parse(
      readFileSync(args[args.indexOf('--config') + 1], 'utf8')
    );
    assertRouteFree(config);
    assert.equal(
      options.env.CLOUDFLARE_API_TOKEN,
      env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN
    );
    assert.equal(
      args.some((arg) => arg.includes('production-fixture')),
      false
    );
    assert.equal(options.timeout, 180000);
    assert.equal(options.cwd, appRoot);
    for (const name of [
      'GITHUB_TOKEN',
      'WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN',
      'WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NODE_OPTIONS',
    ])
      assert.equal(options.env[name], undefined);
    if (state.uncertain) throw new Error('Lost upload response');
    if (state.duringUpload) state.attached = true;
    state.active = newId;
    state.ids = [newId];
    writeFileSync(
      options.env.WRANGLER_OUTPUT_FILE_PATH,
      `${JSON.stringify({
        type: 'deploy',
        worker_name: receipt.profile.name,
        version_id: newId,
      })}\n`
    );
  };
  return {
    state,
    env,
    appRoot,
    run: (options = {}) =>
      main({
        argv: ['calendar', sha],
        env,
        fetcher,
        exec,
        appRoot,
        ...options,
      }),
  };
}

test('held app refuses before provider reads or upload', async (t) => {
  const p = setup(t, { admitted: false });
  await assert.rejects(p.run(), /publication is held/);
  assert.equal(p.state.writes, 0);
  assert.deepEqual(p.state.calls, []);
});

test('admitted private upload keeps topology unchanged and captures rollback', async (t) => {
  const p = setup(t);
  const result = await p.run();
  assert.equal(p.state.writes, 1);
  assert.equal(result.state, 'accepted-private');
  assert.equal(result.versionId, newId);
  assert.deepEqual(result.rollback.versions, [
    { version_id: oldId, percentage: 100 },
  ]);
});

for (const [name, mutate] of [
  [
    'rerun',
    (p) => {
      p.env.GITHUB_RUN_ATTEMPT = '2';
    },
  ],
  [
    'main ref',
    (p) => {
      p.env.GITHUB_REF = 'refs/heads/main';
    },
  ],
  [
    'wrong environment',
    (p) => {
      p.env.PUBLICATION_ENVIRONMENT = 'preview';
    },
  ],
  [
    'staging credential',
    (p) => {
      p.env.CLOUDFLARE_STAGING_API_TOKEN = 'forbidden';
    },
  ],
  [
    'missing named credential',
    (p) => {
      delete p.env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
    },
  ],
  [
    'earlier unknown attempt',
    (p) => {
      p.state.prior = true;
    },
  ],
  [
    'existing canonical attachment',
    (p) => {
      p.state.attached = true;
    },
  ],
  [
    'attached route in another account zone',
    (p) => {
      p.state.attachedRoute = true;
    },
  ],
  [
    'provider workers.dev enabled',
    (p) => {
      p.state.publicServing = 'workers.dev';
    },
  ],
  [
    'provider previews enabled',
    (p) => {
      p.state.publicServing = 'preview';
    },
  ],
  [
    'fixture public inputs',
    (p) => {
      p.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid';
    },
  ],
]) {
  test(`${name} refuses without upload`, async (t) => {
    const p = setup(t);
    mutate(p);
    await assert.rejects(p.run());
    assert.equal(p.state.writes, 0);
  });
}

test('lost upload response stays pending and is never retried', async (t) => {
  const p = setup(t);
  p.state.uncertain = true;
  await assert.rejects(p.run(), /outcome is uncertain/);
  assert.equal(p.state.writes, 1);
  assert.equal(
    JSON.parse(
      readFileSync(join(p.appRoot, 'calendar-production-publication.json'))
    ).state,
    'pending'
  );
  p.state.prior = true;
  await assert.rejects(p.run(), /never replay/);
  assert.equal(p.state.writes, 1);
});

test('matching active version reconciles without another upload', async (t) => {
  const p = setup(t);
  p.state.ids = [newId];
  p.state.active = newId;
  p.state.prior = true;
  const result = await p.run();
  assert.equal(result.state, 'reconciled');
  assert.ok(
    result.rollback.versions.every(
      (version) => version.version_id !== result.versionId
    )
  );
  assert.equal(result.rollback.versions[0].version_id, oldId);
  assert.equal(p.state.writes, 0);
});

test('topology change after upload is not accepted', async (t) => {
  const p = setup(t);
  p.state.duringUpload = true;
  await assert.rejects(p.run(), /Custom Domain/);
  assert.equal(p.state.writes, 1);
  assert.equal(
    JSON.parse(
      readFileSync(join(p.appRoot, 'calendar-production-publication.json'))
    ).state,
    'uploaded'
  );
});

for (const app of ['calendar', 'mail', 'apps']) {
  test(`${app} sealed production config has no serving routes`, (t) => {
    const root = fixture(t, app);
    prepare(root, app, 'production', 'fixture', sha);
    const config = JSON.parse(
      readFileSync(join(root, 'dist/wave1/wrangler.json'))
    );
    assertRouteFree(config);
    for (const mutation of [
      { routes: [{ pattern: `${app}.tuturuuu.com`, custom_domain: true }] },
      { route: `${app}.tuturuuu.com/*` },
      { workers_dev: true },
      { preview_urls: true },
      { services: [] },
      { unexpected: false },
    ]) {
      assert.throws(() => assertRouteFree({ ...config, ...mutation }));
    }
  });
}

test('only the production environment upload step receives the named deploy token', () => {
  const workflow = readWorkflow('wave1-native-production.yaml');
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.app.options, [
    'calendar',
  ]);
  assert.equal(workflow.jobs.publish.environment, 'wave1-calendar-production');
  assert.equal(workflow.jobs.qualify.environment, 'wave1-calendar-production');
  assert.ok(
    workflow.jobs.publish.steps.some((step) =>
      step.run?.includes('bun install --frozen-lockfile --ignore-scripts')
    )
  );
  assert.ok(workflow.jobs.publish.needs.includes('production-policy'));
  assert.ok(
    workflow.jobs.publish.if.includes(
      "needs.production-policy.outputs.allowed == 'true'"
    )
  );
  const tokenSteps = workflow.jobs.publish.steps.filter((step) =>
    JSON.stringify(step).includes(
      'secrets.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN'
    )
  );
  assert.equal(tokenSteps.length, 1);
  assert.equal(
    tokenSteps[0].run,
    'node scripts/ci/wave1-native-production.mjs "$APP" "$SOURCE_SHA"'
  );
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (name !== 'publish')
      assert.ok(
        !JSON.stringify(job).includes('WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN')
      );
  }
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
});

test('qualification dry-run uses sealed route-free bytes without a provider credential', async (t) => {
  const p = setup(t);
  const { main: qualify } = await import('./wave1-native-publish.mjs');
  let executions = 0;
  await qualify({
    argv: ['dry-run', 'calendar', 'production', sha],
    appRoot: p.appRoot,
    env: { RUNNER_TEMP: p.appRoot },
    exec: (_command, args, options) => {
      executions++;
      assert.equal(args.includes('--dry-run'), true);
      assert.equal(
        args[args.indexOf('--outdir') + 1],
        join(p.appRoot, 'calendar-production-dry-run')
      );
      assert.equal(options.env.CLOUDFLARE_API_TOKEN, undefined);
      assertRouteFree(
        JSON.parse(readFileSync(args[args.indexOf('--config') + 1]))
      );
    },
  });
  assert.equal(executions, 1);
  await assert.rejects(
    qualify({
      argv: ['dry-run', 'calendar', 'production', sha],
      appRoot: p.appRoot,
      env: p.env,
    }),
    /Provider credentials forbidden/
  );
});

test('an earlier run refused before upload does not consume a new source', async (t) => {
  const p = setup(t);
  p.state.prior = true;
  p.state.priorMode = 'before';
  await p.run();
  assert.equal(p.state.writes, 1);
});
test('a rerun can proceed only when earlier attempts never entered upload', async (t) => {
  const p = setup(t);
  p.env.GITHUB_RUN_ATTEMPT = '2';
  p.state.priorMode = 'before';
  await p.run();
  assert.equal(p.state.writes, 1);
});
test('unknown earlier upload status across another source SHA refuses', async (t) => {
  const p = setup(t);
  p.state.prior = true;
  p.state.priorMode = 'unknown';
  await assert.rejects(p.run(), /Unknown earlier/);
  assert.equal(p.state.writes, 0);
});
test('reconciliation refuses to use the matched version as its rollback', async (t) => {
  const p = setup(t);
  p.state.ids = [newId];
  p.state.active = newId;
  p.state.noRollbackHistory = true;
  await assert.rejects(p.run(), /original receipt/);
  assert.equal(p.state.writes, 0);
});
test('pre-upload reads share a finite deadline and cannot reach upload after timeout', async (t) => {
  const p = setup(t);
  const fetcher = (_url, options) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json({})), 1000);
      options.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(options.signal.reason);
        },
        { once: true }
      );
    });
  await assert.rejects(p.run({ preflightTimeoutMs: 5, fetcher }));
  assert.equal(p.state.writes, 0);
});
