import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deploy,
  nextAdmission,
  recheckNext,
  verify,
} from './wave1-web-next.mjs';
import {
  requireVerifiedNext,
  signWebNextState,
  WEB_NEXT_LEDGER_KEY,
  webNextLedger,
} from './wave1-web-next-ledger.mjs';

const sha = 'f'.repeat(40);
const projectId = 'prj_fixture0001';
const deploymentId = 'dpl_fixture0001';
const host = 'tuturuuu-web-staging-abc123-fixture.vercel.app';
const bypass = 'b'.repeat(32);
const admission = {
  schema: 1,
  app: 'web-next',
  sourceSha: sha,
  vercelProjectIdEnv: 'VERCEL_WEB_STAGING_PROJECT_ID',
  target: 'staging',
  maxDeploysPerSha: 1,
};
const env = {
  GITHUB_REPOSITORY: 'fixture/repo',
  GITHUB_RUN_ID: '41',
  GITHUB_RUN_ATTEMPT: '1',
  WAVE1_CONTROL_READ_TOKEN: 'control',
  WAVE1_STAGING_ATTEMPT_D1_ID: '33333333-3333-3333-3333-333333333333',
  CLOUDFLARE_STAGING_API_TOKEN: 'staging-fixture',
  CLOUDFLARE_STAGING_ACCOUNT_ID: 'e'.repeat(32),
  VERCEL_ORG_ID: 'team_fixture',
  VERCEL_WEB_STAGING_PROJECT_ID: projectId,
  VERCEL_TOKEN_WEB_STAGING: 'vercel-fixture',
  VERCEL_AUTOMATION_BYPASS_SECRET: bypass,
  TRUSTED_PROXY_ORIGIN_SECRET: 'p'.repeat(40),
};
const scope = {
  databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
  repository: env.GITHUB_REPOSITORY,
  app: 'web-next',
  projectId,
};

function world({
  entries = [],
  fence = 'true',
  nextAdmissionValue = JSON.stringify(admission),
  probesOpen = false,
} = {}) {
  const w = {
    record: signWebNextState(
      { schema: 1, scope, entries },
      env.CLOUDFLARE_STAGING_API_TOKEN
    ),
    writes: 0,
    listed: [],
  };
  w.fetcher = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      if (u.pathname.endsWith('/WAVE1_STAGING_PUBLISH_ENABLED'))
        return Response.json({ value: fence });
      if (u.pathname.endsWith('/WEB_STAGING_NEXT_ADMISSION'))
        return Response.json({ value: nextAdmissionValue });
    }
    if (u.hostname === 'api.cloudflare.com') {
      const { sql, params } = JSON.parse(init.body);
      assert.equal(params.includes(WEB_NEXT_LEDGER_KEY), true);
      if (sql.startsWith('SELECT'))
        return Response.json({
          success: true,
          result: [{ success: true, results: [{ record: w.record }] }],
        });
      const changes = params[2] === w.record ? 1 : 0;
      if (changes) {
        w.record = params[0];
        w.writes++;
      }
      return Response.json({
        success: true,
        result: [{ success: true, meta: { changes } }],
      });
    }
    if (u.hostname === 'api.vercel.com') {
      if (u.pathname === `/v9/projects/${projectId}`)
        return Response.json({
          id: projectId,
          ssoProtection: { deploymentType: 'all' },
          protectionBypass: { [bypass]: { scope: 'automation-bypass' } },
        });
      if (u.pathname.startsWith('/v13/deployments/'))
        return Response.json({
          id: deploymentId,
          url: host,
          projectId,
          readyState: 'READY',
          target: 'staging',
          meta: { githubCommitSha: sha },
        });
      if (u.pathname.endsWith('/aliases'))
        return Response.json({ aliases: [] });
      if (u.pathname.endsWith('/domains'))
        return Response.json({ domains: [] });
      if (u.pathname === '/v6/deployments')
        return Response.json({ deployments: w.listed });
    }
    if (u.hostname === host) {
      const headers = new Headers(init.headers);
      if (probesOpen) return new Response('open');
      if (!headers.has('x-vercel-protection-bypass'))
        return new Response(null, { status: 401 });
      if (!headers.has('x-tuturuuu-origin-auth'))
        return new Response(null, { status: 403 });
      return new Response('ok', {
        headers: { 'x-tuturuuu-staging-supabase-ref': 'fxefojytwimjiqxseqag' },
      });
    }
    throw new Error(`unexpected ${url}`);
  };
  w.execs = 0;
  w.exec = (command, args, options) => {
    w.execs++;
    assert.equal(command, 'vercel');
    assert.ok(args.every((arg) => !arg.includes(env.VERCEL_TOKEN_WEB_STAGING)));
    assert.ok(args.every((arg) => !arg.startsWith('--token')));
    assert.equal(options.env.VERCEL_TOKEN, env.VERCEL_TOKEN_WEB_STAGING);
    assert.ok(
      args.includes('--prebuilt') &&
        args.includes('--target=staging') &&
        !args.includes('--prod')
    );
    assert.ok(args.includes(`githubCommitSha=${sha}`));
    assert.equal(
      options.env.CLOUDFLARE_STAGING_API_TOKEN,
      undefined,
      'no Cloudflare credential reaches the Vercel CLI'
    );
    if (w.execThrows) throw new Error('network');
    return `Preview: https://${host}\n`;
  };
  w.entries = () => JSON.parse(JSON.parse(w.record).data).entries;
  return w;
}

test('Next admission is exact', () => {
  assert.deepEqual(nextAdmission(JSON.stringify(admission), sha), admission);
  for (const patch of [
    { sourceSha: '0'.repeat(40) },
    { target: 'production' },
    { maxDeploysPerSha: 2 },
    { app: 'web' },
    { extra: 1 },
  ])
    assert.throws(
      () => nextAdmission(JSON.stringify({ ...admission, ...patch }), sha),
      JSON.stringify(patch)
    );
});

test('deploy makes exactly one deployment and records it', async () => {
  const w = world();
  assert.deepEqual(
    await deploy({ env, sha, fetcher: w.fetcher, exec: w.exec }),
    { deploymentId, origin: `https://${host}` }
  );
  assert.equal(w.execs, 1);
  assert.equal(w.entries()[0].state, 'deployed');
  // A rerun never deploys again.
  await deploy({ env, sha, fetcher: w.fetcher, exec: w.exec });
  assert.equal(w.execs, 1);
});

for (const [label, options] of [
  ['the stop fence is off', { fence: 'false' }],
  [
    'the admission names another SHA',
    {
      nextAdmissionValue: JSON.stringify({
        ...admission,
        sourceSha: '0'.repeat(40),
      }),
    },
  ],
  [
    'an earlier deployment is unresolved',
    {
      entries: [
        { sha: '1'.repeat(40), runId: '3', runAttempt: '1', state: 'pending' },
      ],
    },
  ],
]) {
  test(`deploy refuses with zero deployments when ${label}`, async () => {
    const w = world(options);
    await assert.rejects(
      deploy({ env, sha, fetcher: w.fetcher, exec: w.exec })
    );
    assert.equal(w.execs, 0);
  });
}

test('a lost deploy receipt stays pending and is reconciled, never redeployed', async () => {
  const w = world();
  w.execThrows = true;
  await assert.rejects(
    deploy({ env, sha, fetcher: w.fetcher, exec: w.exec }),
    /uncertain/
  );
  assert.equal(w.entries()[0].state, 'pending');
  w.execThrows = false;
  await assert.rejects(
    deploy({ env, sha, fetcher: w.fetcher, exec: w.exec }),
    /owner reconciliation/
  );
  w.listed = [{ uid: deploymentId, meta: { githubCommitSha: sha } }];
  await deploy({ env, sha, fetcher: w.fetcher, exec: w.exec });
  assert.equal(w.execs, 1);
  assert.equal(w.entries()[0].state, 'deployed');
});

test('verify writes verified only when every check is green, binding the run id', async () => {
  const deployed = {
    sha,
    runId: '40',
    runAttempt: '1',
    state: 'deployed',
    deploymentId,
    origin: `https://${host}`,
  };
  const open = world({ entries: [deployed], probesOpen: true });
  await assert.rejects(verify({ env, sha, fetcher: open.fetcher }), /refused/);
  assert.equal(open.entries()[0].state, 'deployed');
  const w = world({ entries: [deployed] });
  await verify({ env, sha, fetcher: w.fetcher });
  assert.deepEqual(w.entries()[0], {
    ...deployed,
    state: 'verified',
    verifyRunId: '41',
    verifyRunAttempt: '1',
  });
});

test('the ledger rejects tampering, a foreign project and consumed SHAs', async () => {
  const w = world({
    entries: [{ sha, runId: '1', runAttempt: '1', state: 'failed' }],
  });
  const open = (overrides = {}) =>
    webNextLedger({
      request: async (url, _token, body) =>
        (await w.fetcher(url, { body: JSON.stringify(body) })).json(),
      base: 'https://api.cloudflare.com/client/v4/accounts/x',
      token: env.CLOUDFLARE_STAGING_API_TOKEN,
      databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
      repository: env.GITHUB_REPOSITORY,
      projectId,
      ...overrides,
    });
  const ledger = await open();
  await assert.rejects(ledger.start(sha, '2', '1'), /already consumed/);
  await assert.rejects(
    open({ projectId: 'prj_otherproject' }),
    /scope mismatch/
  );
  await assert.rejects(open({ token: 'other-token' }), /signature/);
});

test('requireVerifiedNext refuses any mismatch', () => {
  const entry = {
    sha,
    state: 'verified',
    deploymentId,
    origin: `https://${host}`,
    verifyRunId: '41',
  };
  const ledger = (e) => ({
    entryFor: (s) => (e && e.sha === s ? e : undefined),
  });
  const pair = { sha, deploymentId, origin: `https://${host}`, projectId };
  assert.equal(requireVerifiedNext(ledger(entry), pair), entry);
  for (const [patch, message] of [
    [{ state: 'deployed' }, /not verified/],
    [{ deploymentId: 'dpl_other00001' }, /differs from the verified/],
    [{ origin: 'https://tuturuuu-web-staging-x.vercel.app' }, /origin differs/],
    [{ verifyRunId: undefined }, /Verification run/],
  ])
    assert.throws(
      () => requireVerifiedNext(ledger({ ...entry, ...patch }), pair),
      message
    );
  assert.throws(
    () => requireVerifiedNext(ledger(null), pair),
    /No Web Next ledger entry/
  );
});

test('readback refuses a disallowed alias before any deployment probe', async () => {
  const w = world();
  let probes = 0;
  const fetcher = async (url, init) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/aliases'))
      return Response.json({ aliases: [{ alias: 'web.example.com' }] });
    if (
      !['api.vercel.com', 'api.cloudflare.com', 'api.github.com'].includes(
        u.hostname
      )
    )
      probes++;
    return w.fetcher(url, init);
  };
  const result = await recheckNext({ env, sha, deploymentId, fetcher });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /forbidden staging host/.test(f)));
  assert.equal(probes, 0);
  assert.deepEqual(result.checks, []);
});
