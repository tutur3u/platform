import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  alreadyServing,
  confirmStillServing,
  renewServingLease,
} from '../../apps/cron-control/scripts/verify-already-serving.mjs';

import { captureAfter, settingsPlan } from './cf-worker-settings.mjs';
import {
  BASELINE,
  liveWorker,
} from './cf-worker-settings-transition.fixture.mjs';

const SHA = 'a'.repeat(40);
const ACCOUNT = 'b'.repeat(32);
const WORKER = 'tuturuuu-cron-control';
const DEPLOYMENT = '00000000-0000-4000-8000-000000000001';
const VERSION = '00000000-0000-4000-8000-000000000002';
const LEDGER = 'c'.repeat(32);
const RELAY = 'CRON_CONTROL_RELAY_TOKEN';
const REPO = 'tutur3u/platform';
const ACTIONS = `https://api.github.com/repos/${REPO}/actions`;
const VERSIONS = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/workers/${WORKER}/versions`;
const DEPLOYMENTS = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${WORKER}/deployments`;
const BYTES = Buffer.from('export default {};\n');
const plan = {
  target: { name: WORKER, accountId: ACCOUNT },
  previous: {},
  transition: { decision: 'reviewed transition' },
};

function fixture(t) {
  const appDir = mkdtempSync(join(tmpdir(), 'cron-control-serving-'));
  t.after(() => rmSync(appDir, { recursive: true, force: true }));
  const output = join(appDir, '.cloudflare/output/v0');
  const worker = join(output, 'workers/default');
  const bundle = join(worker, 'bundle');
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(output, 'config.json'), '{}');
  writeFileSync(
    join(worker, 'worker.config.json'),
    JSON.stringify({
      manifest: {
        type: 'complete',
        mainModule: 'index.js',
        modules: { 'index.js': { type: 'esm' } },
      },
    })
  );
  writeFileSync(join(bundle, 'index.js'), BYTES);

  const secretNames = [RELAY, 'SUPABASE_URL'];
  const proof = {
    sha: SHA,
    accountId: ACCOUNT,
    worker: WORKER,
    deploymentId: DEPLOYMENT,
    versionId: VERSION,
    settingsHash: 'd'.repeat(64),
    secretNamesSha256: createHash('sha256')
      .update(JSON.stringify(secretNames))
      .digest('hex'),
    moduleSha256: createHash('sha256').update(BYTES).digest('hex'),
    runId: 1,
    artifactId: 2,
    artifactDigest: 'e'.repeat(64),
    ledgerNamespaceId: LEDGER,
    migrationTag: 'v1',
  };
  const before = {
    accountId: ACCOUNT,
    worker: WORKER,
    stage: 'target',
    transition: plan.transition.decision,
    settingsHash: proof.settingsHash,
    secrets: [...secretNames],
    rollback: [
      {
        id: DEPLOYMENT,
        versions: [{ version_id: VERSION, percentage: 100 }],
      },
    ],
  };
  const run = {
    id: proof.runId,
    path: '.github/workflows/cron-control-cloudflare.yaml',
    repository: { id: 10, full_name: REPO },
    head_repository: { id: 10, full_name: REPO },
    head_branch: 'main',
    head_sha: SHA,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
  };
  const artifact = {
    id: proof.artifactId,
    expired: false,
    name: `cron-control-worker-${SHA}`,
    digest: `sha256:${proof.artifactDigest}`,
    workflow_run: {
      id: run.id,
      repository_id: 10,
      head_repository_id: 10,
      head_branch: 'main',
      head_sha: SHA,
    },
  };
  const live = {
    id: VERSION,
    migration_tag: 'v1',
    exports: { CronLedger: { type: 'durable-object', storage: 'sqlite' } },
    main_module: 'index.js',
    modules: [
      {
        name: 'index.js',
        content_type: 'application/javascript+module',
        content_base64: BYTES.toString('base64'),
      },
    ],
    bindings: [
      { name: RELAY, type: 'secret_text' },
      { name: 'SUPABASE_URL', type: 'secret_text' },
      {
        name: 'CRON_LEDGER',
        class_name: 'CronLedger',
        namespace_id: LEDGER,
        type: 'durable_object_namespace',
      },
    ],
  };
  const calls = [];
  const state = {
    proof,
    before,
    fresh: structuredClone(before),
    appDir,
    bundle,
    run,
    artifact,
    live,
    latest: { id: VERSION },
    calls,
    deployments: structuredClone(before.rollback),
    async fetchImpl(url, { method, redirect, headers }) {
      assert.equal(method, 'GET');
      assert.equal(redirect, 'error');
      calls.push(url);
      switch (url) {
        case `${ACTIONS}/runs/1`:
          assert.equal(headers.authorization, undefined);
          return Response.json(state.run);
        case `${ACTIONS}/artifacts/2`:
          assert.equal(headers.authorization, undefined);
          return Response.json(state.artifact);
        case `${VERSIONS}/${VERSION}?include=modules`:
          return state.live
            ? Response.json({ success: true, result: state.live })
            : new Response(null, { status: 404 });
        case `${VERSIONS}/latest`:
          return Response.json({ success: true, result: state.latest });
        case DEPLOYMENTS:
          return Response.json({
            success: true,
            result: { deployments: state.deployments },
          });
        default:
          assert.fail('unexpected GET');
      }
    },
  };
  return state;
}

function options(state) {
  return {
    input: JSON.stringify(state.proof),
    sha: SHA,
    before: state.before,
    appDir: state.appDir,
    plan,
    accountId: ACCOUNT,
    token: 'mock-worker-read-token',
    fetchImpl: state.fetchImpl,
  };
}

const check = (state) =>
  alreadyServing(options(state), {
    checkLease: () => {
      state.calls.push('lease');
      return () => state.calls.push('lease');
    },
    capture: async () => {
      state.calls.push('fresh settings');
      return state.fresh;
    },
  });

test('opt-in proves exact-main producer, approved bytes and fresh serving status under the lease', async (t) => {
  const state = fixture(t);
  assert.equal(await check(state), true);
  assert.deepEqual(state.calls, [
    'lease',
    `${ACTIONS}/runs/1`,
    `${ACTIONS}/artifacts/2`,
    `${VERSIONS}/${VERSION}?include=modules`,
    'fresh settings',
    `${VERSIONS}/latest`,
    'lease',
  ]);
});

test('without a release record the strict publisher proceeds without extra reads', async () => {
  assert.equal(await alreadyServing({ input: '' }), false);
});

test('a held job refuses a present proof without printing it', () => {
  const input = '{"metadata":"private fixture"}';
  const secret = Buffer.from(input).toString('base64');
  const script = fileURLToPath(
    new URL(
      '../../apps/cron-control/scripts/verify-already-serving.mjs',
      import.meta.url
    )
  );
  const result = spawnSync(process.execPath, [script, 'check'], {
    encoding: 'utf8',
    env: {
      GITHUB_REPOSITORY: REPO,
      GITHUB_REF: 'refs/heads/production',
      CRON_CONTROL_SERVING_PROOF: secret,
      CRON_COORDINATOR_PUBLISH: 'false',
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /held by the coordinator/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(input));
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
});

test('malformed input is a hard failure, with no fallback to strict publish', async () => {
  await assert.rejects(alreadyServing({ input: '{' }), SyntaxError);
});

test('a missing lease stops even an otherwise approved version before extra reads', async (t) => {
  const state = fixture(t);
  await assert.rejects(
    alreadyServing(options(state), {
      checkLease() {
        assert.fail('no active grant');
      },
    }),
    /no active grant/
  );
  assert.deepEqual(state.calls, []);
});

for (const [name, mutate, diagnostic] of [
  [
    'stale approval SHA',
    (s) => {
      s.proof.sha = 'f'.repeat(40);
    },
    /different source SHA/,
  ],
  [
    'wrong approval account',
    (s) => {
      s.proof.accountId = 'f'.repeat(32);
    },
    /invalid Cron Control serving approval/,
  ],
  [
    'wrong approval Worker',
    (s) => {
      s.proof.worker = 'another-worker';
    },
    /invalid Cron Control serving approval/,
  ],
  [
    'previous snapshot stage',
    (s) => {
      s.before.stage = 'previous';
    },
    /target settings differ/,
  ],
  [
    'changed settings hash',
    (s) => {
      s.before.settingsHash = 'wrong';
    },
    /target settings differ/,
  ],
  [
    'moved deployment',
    (s) => {
      s.before.rollback[0].id = 'moved';
    },
    /no longer serving alone/,
  ],
  [
    'wrong serving version',
    (s) => {
      s.before.rollback[0].versions[0].version_id = 'other';
    },
    /no longer serving alone/,
  ],
  [
    'split traffic',
    (s) => {
      s.before.rollback[0].versions[0].percentage = 90;
    },
    /no longer serving alone/,
  ],
  [
    'missing relay in snapshot',
    (s) => {
      s.before.secrets.shift();
    },
    /secret inventory differs/,
  ],
  [
    'foreign producer',
    (s) => {
      s.run.head_repository.full_name = 'a/fork';
    },
    /not the approved main run/,
  ],
  [
    'different producer workflow',
    (s) => {
      s.run.path = '.github/workflows/other.yaml';
    },
    /not the approved main run/,
  ],
  [
    'non-main producer',
    (s) => {
      s.run.head_branch = 'other';
    },
    /not the approved main run/,
  ],
  [
    'non-green producer',
    (s) => {
      s.run.conclusion = 'failure';
    },
    /not the approved main run/,
  ],
  [
    'artifact digest drift',
    (s) => {
      s.artifact.digest = 'other';
    },
    /artifact metadata differs/,
  ],
  [
    'different artifact producer',
    (s) => {
      s.artifact.workflow_run.id = 20;
    },
    /artifact metadata differs/,
  ],
  [
    'expired artifact',
    (s) => {
      s.artifact.expired = true;
    },
    /artifact metadata differs/,
  ],
  [
    'extra provider module',
    (s) => {
      s.live.modules.push({ name: 'extra.js' });
    },
    /module inventory differs/,
  ],
  [
    'missing provider module',
    (s) => {
      s.live.modules = [];
    },
    /module inventory differs/,
  ],
  [
    'extra qualified module',
    (s) => {
      writeFileSync(join(s.bundle, 'extra.js'), BYTES);
    },
    /module inventory differs/,
  ],
  [
    'missing qualified module',
    (s) => {
      rmSync(join(s.bundle, 'index.js'));
    },
    /module inventory differs/,
  ],
  [
    'unapproved qualified digest',
    (s) => {
      s.proof.moduleSha256 = 'f'.repeat(64);
    },
    /differs from the approved digest/,
  ],
  [
    'unavailable module bytes',
    (s) => {
      delete s.live.modules[0].content_base64;
    },
    /module bytes differ or are unavailable/,
  ],
  [
    'mismatched module bytes',
    (s) => {
      s.live.modules[0].content_base64 = 'Zm9v';
    },
    /module bytes differ/,
  ],
  [
    'unavailable version',
    (s) => {
      s.live = null;
    },
    /HTTP 404/,
  ],
  [
    'missing relay on version',
    (s) => {
      s.live.bindings.shift();
    },
    /version secret inventory differs/,
  ],
  [
    'namespace drift',
    (s) => {
      s.live.bindings[2].namespace_id = 'different';
    },
    /migration identity differs/,
  ],
  [
    'migration tag drift',
    (s) => {
      s.live.migration_tag = 'v2';
    },
    /migration identity differs/,
  ],
  [
    'fresh settings drift',
    (s) => {
      s.fresh.settingsHash = 'different';
    },
    /settings changed/,
  ],
  [
    'fresh active version drift',
    (s) => {
      s.fresh.rollback[0].versions[0].version_id = 'different';
    },
    /no longer serving alone/,
  ],
  [
    'latest version drift',
    (s) => {
      s.latest.id = 'different';
    },
    /latest Cron Control version differs/,
  ],
]) {
  test(`refuses reuse on ${name}`, async (t) => {
    const state = fixture(t);
    mutate(state);
    await assert.rejects(check(state), diagnostic);
  });
}

test('the post-check refuses redeployment of the same version before the marker', async (t) => {
  const state = fixture(t);
  state.fresh.rollback[0].id = 'different-deployment';
  const approved = options(state);
  const proofDigest = createHash('sha256').update(approved.input).digest('hex');
  await assert.rejects(
    confirmStillServing(
      { ...approved, proofDigest, after: state.fresh },
      {
        checkLease: () => () => {},
      }
    ),
    /no longer serving alone/
  );
  assert.deepEqual(state.calls, []);
});

test('the post-check refuses a changed approval before the marker', async (t) => {
  const state = fixture(t);
  await assert.rejects(
    confirmStillServing(
      {
        ...options(state),
        proofDigest: 'f'.repeat(64),
        after: state.fresh,
      },
      { checkLease: () => () => {} }
    ),
    /approval changed during verification/
  );
  assert.deepEqual(state.calls, []);
});

test('the post-check re-reads current traffic even when the after snapshot passed', async (t) => {
  const state = fixture(t);
  const approved = options(state);
  const proofDigest = createHash('sha256').update(approved.input).digest('hex');
  const confirm = () =>
    confirmStillServing(
      { ...approved, proofDigest, after: state.fresh },
      { checkLease: () => () => {}, capture: async () => state.fresh }
    );
  await confirm();
  assert.deepEqual(state.calls, [`${VERSIONS}/latest`, DEPLOYMENTS]);
  state.deployments[0].id = 'changed-deployment';
  await assert.rejects(confirm(), /no longer serving alone/);
});

test('final canonical read rejects independent schedule drift with unchanged deployment and version', async (t) => {
  const state = fixture(t);
  const baseline = structuredClone(BASELINE);
  for (const identity of [baseline.identity, baseline.previousIdentity]) {
    identity.accountId = ACCOUNT;
    identity.secrets = [...identity.secrets, RELAY];
  }
  const plan = settingsPlan(baseline);
  const live = liveWorker(plan.target, {
    deployments: { deployments: state.deployments },
  });
  const credentials = { accountId: ACCOUNT, token: 'mock-worker-read-token' };
  const before = await captureAfter({
    plan,
    ...credentials,
    fetchImpl: live.fetchImpl,
  });
  state.proof.settingsHash = before.settingsHash;
  state.proof.secretNamesSha256 = createHash('sha256')
    .update(JSON.stringify([...before.secrets].sort()))
    .digest('hex');
  const approved = options(state);
  const proofDigest = createHash('sha256').update(approved.input).digest('hex');
  const drift = liveWorker(plan.target, {
    deployments: { deployments: state.deployments },
    schedules: { schedules: [] },
  });
  await assert.rejects(
    confirmStillServing(
      {
        ...approved,
        proofDigest,
        before,
        after: before,
        plan,
        fetchImpl: drift.fetchImpl,
      },
      { checkLease: () => () => {} }
    ),
    /cron schedules differ/
  );
  assert.ok(drift.calls.some((url) => url.endsWith('/schedules')));
  assert.deepEqual(state.deployments, before.rollback);
  assert.ok(!drift.calls.some((url) => url.endsWith('/versions/latest')));
});

function leaseFixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'cron-control-lease-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const origin = 'https://coordinator.example.test';
  const stateFile = join(folder, 'lease.json');
  const now = Date.parse('2026-11-22T11:00:00Z');
  const grant = {
    jobId: DEPLOYMENT,
    attemptId: VERSION,
    workerId: '42:1:deploy',
    epoch: 2,
    leaseDeadline: new Date(now - 1).toISOString(),
  };
  writeFileSync(
    stateFile,
    JSON.stringify({
      deploymentId: DEPLOYMENT,
      base: origin,
      grant,
    })
  );
  const env = {
    DC_STATE_FILE: stateFile,
    DEPLOY_COORDINATOR_ORIGIN: origin,
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example.test/token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-oidc-request',
    CRON_COORDINATOR_CHECK: 'success',
    CRON_COORDINATOR_DEPLOYMENT_ID: DEPLOYMENT,
    GITHUB_RUN_ID: '42',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_JOB: 'deploy',
  };
  const renewed = {
    ...grant,
    leaseDeadline: new Date(now + 60_000).toISOString(),
  };
  const calls = [];
  const fixture = {
    env,
    grant,
    renewed,
    calls,
    status: 200,
    now,
    deps: {
      now: () => fixture.now,
      sleep: async () => {},
      async fetchImpl(url, init) {
        calls.push({ url, method: init.method });
        assert.equal(init.redirect, 'error');
        if (init.method === 'GET') return Response.json({ value: 'mock-oidc' });
        assert.equal(
          url,
          `${origin}/v1/projects/cron-control/environments/production/deployments/${DEPLOYMENT}/heartbeat`
        );
        assert.deepEqual(JSON.parse(init.body), {
          grant: { attemptId: VERSION, epoch: grant.epoch },
        });
        return Response.json(renewed, { status: fixture.status });
      },
    },
  };
  return fixture;
}

test('proof accepts an authoritative renewal past the original disk deadline', async (t) => {
  const state = leaseFixture(t);
  const verify = await renewServingLease(state.env, state.deps);
  assert.deepEqual(
    state.calls.map(({ method }) => method),
    ['GET', 'POST']
  );
  verify();
  state.now += 60_000;
  assert.throws(verify, /expired or was fenced/);
});

test('proof refuses a failed authoritative heartbeat', async (t) => {
  const state = leaseFixture(t);
  state.status = 409;
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /did not renew the exact lease/
  );
  assert.deepEqual(
    state.calls.map(({ method }) => method),
    ['GET', 'POST']
  );
});

test('proof refuses a mismatched or expired authoritative grant', async (t) => {
  const state = leaseFixture(t);
  state.renewed.epoch += 1;
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /did not renew the exact lease/
  );
  state.renewed.epoch = state.grant.epoch;
  state.renewed.leaseDeadline = new Date(state.now).toISOString();
  await assert.rejects(
    renewServingLease(state.env, state.deps),
    /expired or was fenced/
  );
});
