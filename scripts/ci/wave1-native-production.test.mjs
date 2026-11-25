import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { prepare } from './wave1-native-artifact.mjs';
import { assertRouteFree } from './wave1-native-production.mjs';
import {
  newId,
  oldId,
  setup,
  sha,
} from './wave1-native-production-test-helper.mjs';
import { productionFailureMessage } from './wave1-native-upload-error.mjs';

const require = createRequire(import.meta.url);
const { fixture } = require('./wave1-native-test-fixture.cjs');
const { readWorkflow } = require('./workflow-yaml-test-helper');

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
  assert.equal(p.state.settingsReads, 1);
  assert.equal(result.state, 'accepted-private');
  assert.equal(result.versionId, newId);
  assert.deepEqual(result.rollback.versions, [
    { version_id: oldId, percentage: 100 },
  ]);
});

test('Mail production acceptance reads full sampling with the named read credential', async (t) => {
  const p = setup(t, { app: 'mail' });
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.settingsReads, 1);
  assert.equal(p.state.settingsWaitMs, 0);
});

test('Mail production accepts matching settings after a null read', async (t) => {
  const p = setup(t, { app: 'mail' });
  p.state.settingsLagReads = 1;
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.settingsReads, 2);
  assert.equal(p.state.settingsWaitMs, 5_000);
  assert.equal(p.state.writes, 1);
  assert.equal(p.state.active, newId);
});

test('Mail production reports persistent settings drift after activation', async (t) => {
  const p = setup(t, { app: 'mail' });
  p.state.scriptSettings = {
    observability: { enabled: false, head_sampling_rate: 1 },
  };
  await assert.rejects(p.run(), (error) => {
    assert.match(
      productionFailureMessage(error),
      /tuturuuu-mail script-settings check timed out after 12 attempts \(expected enabled=true, head_sampling_rate=1; last observed enabled=false, head_sampling_rate=1\)\. The new version is confirmed active at 100%\. Treat any settings mismatch as a separate settings incident\. Resolve it with a release-authority-ACKed settings PATCH/
    );
    return true;
  });
  assert.equal(p.state.settingsReads, 12);
  assert.equal(p.state.settingsWaitMs, 55_000);
  assert.equal(p.state.writes, 1);
  assert.equal(p.state.active, newId);
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
  const secret = ['cf_secr', 'et_fixt', 'ure_NEV', 'ER_RETA', 'IN'].join('');
  p.state.uploadError = Object.assign(new Error(secret), {
    status: 1,
    signal: null,
    stderr: Buffer.from(`Authorization: Bearer ${secret}\nAPI [code: 10021]`),
  });
  await assert.rejects(p.run(), /outcome is uncertain/);
  assert.equal(p.state.writes, 1);
  assert.equal(
    JSON.parse(
      readFileSync(
        join(p.env.RUNNER_TEMP, 'calendar-production-publication.json')
      )
    ).state,
    'pending'
  );
  const saved = readFileSync(
    join(p.env.RUNNER_TEMP, 'calendar-production-publication.json'),
    'utf8'
  );
  assert.equal(saved.includes(secret), false);
  assert.deepEqual(JSON.parse(saved).uploadFailure, {
    exitCode: 1,
    signal: null,
    cfCode: 10021,
    cfErrors: [{ code: 10021, message: 'API' }],
  });
  p.state.prior = true;
  await assert.rejects(p.run(), /never replay/);
  assert.equal(p.state.writes, 1);
});

test('documented size refusal retains exact measurements before any provider upload', async (t) => {
  const p = setup(t, { oversized: true });
  await assert.rejects(p.run(), /Documented upload limits exceeded/u);
  assert.equal(p.state.writes, 0);
  assert.equal(p.state.active, oldId);
  const receipt = JSON.parse(
    readFileSync(
      join(p.env.RUNNER_TEMP, 'calendar-production-publication.json')
    )
  );
  assert.equal(receipt.state, 'refused-before-upload');
  assert.equal(receipt.measurements.script.bytes, 67108865);
  assert.ok(receipt.measurements.script.gzipBytes > 0);
});

test('matching active version reconciles without another upload', async (t) => {
  const p = setup(t);
  p.state.ids = [newId];
  p.state.active = newId;
  p.state.prior = true;
  const result = await p.run();
  assert.equal(p.state.settingsReads, 1);
  assert.equal(result.state, 'accepted-private');
  assert.equal(result.reconciled, true);
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
      readFileSync(
        join(p.env.RUNNER_TEMP, 'calendar-production-publication.json')
      )
    ).state,
    'healthy'
  );
});

const calendarTopology = {
  reason: 'fixture',
  customDomains: ['calendar.tuturuuu.com'],
  routes: [],
};

test('a reviewed Custom Domain publishes behind the unchanged hostname', async (t) => {
  const p = setup(t);
  p.state.servingTopology = calendarTopology;
  p.state.attached = true;
  p.state.attachedHostname = 'calendar.tuturuuu.com';
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.writes, 1);
  assert.deepEqual(
    result.topology.domains.map(({ hostname }) => hostname),
    ['calendar.tuturuuu.com']
  );
  assert.equal(result.rollback.versions[0].version_id, oldId);
});

for (const [name, mutate, message] of [
  [
    'an unreviewed Custom Domain',
    (state) => {
      state.attachedHostname = 'other.tuturuuu.com';
    },
    /Custom Domains differ/,
  ],
  [
    'a missing reviewed Custom Domain',
    (state) => {
      state.attached = false;
    },
    /Custom Domains differ/,
  ],
  [
    'an extra route',
    (state) => {
      state.attachedRoute = true;
    },
    /routes differ/,
  ],
]) {
  test(`a reviewed serving topology refuses ${name} before upload`, async (t) => {
    const p = setup(t);
    p.state.servingTopology = calendarTopology;
    p.state.attached = true;
    p.state.attachedHostname = 'calendar.tuturuuu.com';
    mutate(p.state);
    await assert.rejects(p.run(), message);
    assert.equal(p.state.writes, 0);
  });
}

test('a route-free Worker without a record refuses an attached Custom Domain', async (t) => {
  const p = setup(t);
  p.state.attached = true;
  p.state.attachedHostname = 'calendar.tuturuuu.com';
  await assert.rejects(p.run(), /record a reviewed productionServingTopology/);
  assert.equal(p.state.writes, 0);
});

test('an older SHA stops as superseded when a newer one already serves', async (t) => {
  const p = setup(t);
  p.state.liveSha = 'f'.repeat(40);
  p.state.compareStatus = 'ahead';
  const result = await p.run();
  assert.equal(result.state, 'superseded');
  assert.equal(result.liveSha, 'f'.repeat(40));
  assert.equal(p.state.writes, 0);
  assert.match(
    p.state.compares[0],
    new RegExp(`/compare/${sha}\\.\\.\\.${'f'.repeat(40)}`)
  );
  const steps = {
    upload: {
      ...p.env,
      WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
    },
    verify: { ...p.env, WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN: undefined },
  };
  for (const [mode, env] of Object.entries(steps)) {
    const followUp = await p.run({ argv: ['calendar', sha, mode], env });
    assert.equal(followUp.state, 'superseded', mode);
  }
  assert.equal(p.state.writes, 0);
});

test('a newer SHA publishes over an older live version', async (t) => {
  const p = setup(t);
  p.state.liveSha = 'f'.repeat(40);
  p.state.compareStatus = 'behind';
  const result = await p.run();
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.writes, 1);
});

test('a live version off the production history refuses before upload', async (t) => {
  const p = setup(t);
  p.state.liveSha = 'f'.repeat(40);
  p.state.compareStatus = 'diverged';
  await assert.rejects(p.run(), /not on the production history/);
  assert.equal(p.state.writes, 0);
});

test('a planner push and a dispatch publish; other events refuse', async (t) => {
  const p = setup(t);
  p.env.GITHUB_EVENT_NAME = 'push';
  assert.equal((await p.run()).state, 'accepted-private');
  const refused = setup(t);
  refused.env.GITHUB_EVENT_NAME = 'pull_request';
  await assert.rejects(refused.run(), /production push or dispatch/);
});

for (const app of ['calendar', 'mail', 'apps', 'finance', 'drive']) {
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
      { upload_source_maps: true },
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
    'mail',
    'apps',
    'finance',
    'drive',
  ]);
  const environment = 'wave1-${{ inputs.app }}-production';
  assert.equal(workflow.jobs.publish.environment, environment);
  // A release-candidate seal qualifies in the credential-free artifact
  // environment; wave1-mail-release-artifact.test.mjs evaluates it per ref.
  assert.equal(
    workflow.jobs.qualify.environment,
    "${{ startsWith(github.ref, 'refs/heads/release-candidate/') && format('wave1-{0}-artifact', inputs.app) || format('wave1-{0}-production', inputs.app) }}"
  );
  assert.equal(workflow.jobs.publish.env.PUBLICATION_ENVIRONMENT, environment);
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
  assert.deepEqual(
    tokenSteps.map((step) => step.id),
    ['upload', 'recover']
  );
  // Recovery holds only the deploy credential and runs only after an upload
  // step that failed or was cancelled.
  const recover = tokenSteps[1];
  assert.deepEqual(Object.keys(recover.env), [
    'WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN',
  ]);
  assert.match(recover.if, /failure\(\) \|\| cancelled\(\)/u);
  assert.match(recover.if, /steps\.upload\.outcome != 'skipped'/u);
  assert.equal(
    recover.run,
    'node scripts/ci/wave1-native-production.mjs "$APP" "$SOURCE_SHA" recover'
  );
  const readSteps = workflow.jobs.publish.steps.filter((step) =>
    JSON.stringify(step).includes(
      'secrets.WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN'
    )
  );
  assert.deepEqual(
    readSteps.map((step) => step.id),
    ['preflight', 'verify']
  );
  assert.ok(
    workflow.jobs.publish.steps.findIndex((step) => step.id === 'preflight') <
      workflow.jobs.publish.steps.findIndex((step) => step.id === 'upload')
  );
  assert.equal(workflow.jobs.publish.name, 'publish-$' + '{{ inputs.app }}');
  assert.equal(
    tokenSteps[0].run,
    'node scripts/ci/wave1-native-production.mjs "$APP" "$SOURCE_SHA" upload'
  );
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (name !== 'publish')
      assert.ok(
        !JSON.stringify(job).includes(
          'WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN'
        ) &&
          !JSON.stringify(job).includes(
            'WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN'
          )
      );
  }
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(
    workflow.jobs.publish.steps.find((step) =>
      step.name?.startsWith('Retain private upload')
    ).with['retention-days'],
    90
  );
});

test('qualification dry-run uses sealed route-free bytes without a provider credential', async (t) => {
  const p = setup(t);
  const { main: qualify } = await import('./wave1-native-publish.mjs');
  let executions = 0;
  await qualify({
    argv: ['dry-run', 'calendar', 'production', sha],
    appRoot: p.appRoot,
    env: { RUNNER_TEMP: p.env.RUNNER_TEMP },
    exec: (_command, args, options) => {
      executions++;
      assert.equal(args.includes('--dry-run'), true);
      p.exec(_command, args, options);
      assert.equal(options.env.CLOUDFLARE_API_TOKEN, undefined);
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

test('separate preflight, upload and verification steps enforce credential isolation', async (t) => {
  const p = setup(t);
  const readEnv = { ...p.env };
  delete readEnv.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
  const preflight = await p.run({
    argv: ['calendar', sha, 'preflight'],
    env: readEnv,
  });
  assert.equal(preflight.state, 'preflight');
  assert.equal(p.state.writes, 0);
  assert.ok(p.state.calls.length > 0);
  const uploadEnv = { ...p.env };
  delete uploadEnv.WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN;
  delete uploadEnv.GITHUB_TOKEN;
  const readsBefore = p.state.calls.length;
  const uploaded = await p.run({
    argv: ['calendar', sha, 'upload'],
    env: uploadEnv,
  });
  assert.equal(uploaded.state, 'healthy');
  assert.equal(p.state.writes, 1);
  // The upload step reads the uploaded version's module names, then stages,
  // switches and reads back deployments, all with its own credential; it
  // reads no topology, history or settings.
  const uploadCalls = p.state.calls.slice(readsBefore);
  assert.ok(
    uploadCalls.every(
      (url) =>
        url.endsWith('/deployments') ||
        /\/workers\/workers\/[^/]+\/versions\/[^/?]+\?include=modules$/u.test(
          url
        )
    ),
    uploadCalls.join(', ')
  );
  assert.equal(
    uploadCalls.filter((url) => url.endsWith('?include=modules')).length,
    1
  );
  delete readEnv.GITHUB_TOKEN;
  const accepted = await p.run({
    argv: ['calendar', sha, 'verify'],
    env: readEnv,
  });
  assert.equal(accepted.state, 'accepted-private');
  assert.equal(p.state.writes, 1);
});
for (const mode of ['preflight', 'upload', 'verify'])
  test(`${mode} refuses credentials belonging to another step`, async (t) => {
    const p = setup(t);
    await assert.rejects(
      p.run({ argv: ['calendar', sha, mode] }),
      /credential|credentials/
    );
    assert.equal(p.state.writes, 0);
  });

test('an inactive matching version refuses during read-only preflight', async (t) => {
  const p = setup(t);
  p.state.ids = [newId];
  const env = { ...p.env };
  delete env.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
  await assert.rejects(
    p.run({ argv: ['calendar', sha, 'preflight'], env }),
    /active at 100%/
  );
  assert.equal(p.state.writes, 0);
});

test('publication mode is required', async (t) => {
  const p = setup(t);
  await assert.rejects(p.run({ argv: ['calendar', sha] }));
  assert.deepEqual(p.state.calls, []);
});

for (const [name, mutate] of [
  [
    'expired preflight',
    (record) => {
      record.preflightAt = Date.now() - 120_001;
    },
  ],
  [
    'another run',
    (record) => {
      record.runId = '999';
    },
  ],
  [
    'another attempt',
    (record) => {
      record.runAttempt = '9';
    },
  ],
])
  test(`${name} refuses before upload`, async (t) => {
    const p = setup(t);
    const readEnv = { ...p.env };
    delete readEnv.WAVE1_PRODUCTION_CLOUDFLARE_API_TOKEN;
    const record = await p.run({
      argv: ['calendar', sha, 'preflight'],
      env: readEnv,
    });
    mutate(record);
    writeFileSync(
      join(p.env.RUNNER_TEMP, 'calendar-production-publication.json'),
      JSON.stringify(record)
    );
    const uploadEnv = { ...p.env };
    delete uploadEnv.GITHUB_TOKEN;
    delete uploadEnv.WAVE1_PRODUCTION_CLOUDFLARE_READ_TOKEN;
    await assert.rejects(
      p.run({ argv: ['calendar', sha, 'upload'], env: uploadEnv })
    );
    assert.equal(p.state.writes, 0);
  });

test('scriptless ACME exclusion is not a Worker serving attachment', async (t) => {
  const p = setup(t);
  p.state.scriptlessAcme = true;
  const result = await p.run();
  assert.equal(p.state.settingsReads, 1);
  assert.equal(result.state, 'accepted-private');
  assert.equal(p.state.writes, 1);
});
