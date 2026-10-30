// Web issuer publisher gates (staging-web-publisher Tess conditions (a), (b)):
// the real publisher entrypoint against counting provider and CLI fixtures.
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  publisher,
  sha,
  webFallback,
} = require('./wave1-native-publication-harness.cjs');

const projectId = 'prj_fixture0001';
const host = new URL(webFallback.origin).hostname;

async function webPublisher(t, mutate = () => {}) {
  const { signWebNextState, WEB_NEXT_LEDGER_KEY } = await import(
    './wave1-web-next-ledger.mjs'
  );
  const world = {
    project: {
      id: projectId,
      ssoProtection: { deploymentType: 'all' },
      passwordProtection: null,
      trustedIps: null,
      optionsAllowlist: null,
      protectionBypass: { ['b'.repeat(32)]: { scope: 'automation-bypass' } },
    },
    deployment: {
      id: webFallback.deploymentId,
      url: host,
      projectId,
      readyState: 'READY',
      target: 'staging',
      meta: { githubCommitSha: sha },
    },
    aliases: { aliases: [] },
    domains: { domains: [] },
    openPath: null,
    nextEntry: {
      sha,
      runId: '7',
      runAttempt: '1',
      state: 'verified',
      deploymentId: webFallback.deploymentId,
      origin: webFallback.origin,
      verifyRunId: '7',
      verifyRunAttempt: '1',
    },
    vercelReads: 0,
    nextLedgerWrites: 0,
  };
  let nextRecord;
  const preFetch = async (u, options, _state) => {
    if (u.hostname === 'api.cloudflare.com' && u.pathname.endsWith('/query')) {
      const { sql, params } = JSON.parse(options.body);
      if (!params.includes(WEB_NEXT_LEDGER_KEY)) return null;
      if (sql.startsWith('SELECT'))
        return Response.json({
          success: true,
          result: [{ success: true, results: [{ record: nextRecord }] }],
        });
      world.nextLedgerWrites++;
      return Response.json({
        success: true,
        result: [{ success: true, meta: { changes: 0 } }],
      });
    }
    if (u.hostname === 'api.vercel.com') {
      world.vercelReads++;
      assert.equal(
        options.method,
        'GET',
        'Vercel is read-only for the publisher'
      );
      if (u.pathname === `/v9/projects/${projectId}`)
        return Response.json(world.project);
      if (u.pathname === `/v13/deployments/${webFallback.deploymentId}`)
        return Response.json(world.deployment);
      if (u.pathname.endsWith('/aliases')) return Response.json(world.aliases);
      if (u.pathname.endsWith('/domains')) return Response.json(world.domains);
    }
    if (u.hostname.endsWith('.vercel.app')) {
      const headers = new Headers(options.headers);
      if (
        world.openPath &&
        `${u.pathname}${u.search}`.startsWith(world.openPath)
      )
        return new Response('open');
      if (!headers.has('x-vercel-protection-bypass'))
        return new Response('auth', { status: 401 });
      if (!headers.has('x-tuturuuu-origin-auth'))
        return new Response('proof', { status: 403 });
      return new Response('login', {
        headers: { 'x-tuturuuu-staging-supabase-ref': 'fxefojytwimjiqxseqag' },
      });
    }
    return null;
  };
  const p = await publisher(t, 'web', { preFetch });
  mutate(world, p);
  nextRecord = signWebNextState(
    {
      schema: 1,
      scope: {
        databaseId: p.env.WAVE1_STAGING_ATTEMPT_D1_ID,
        repository: 'fixture/repo',
        app: 'web-next',
        projectId,
      },
      entries: world.nextEntry ? [world.nextEntry] : [],
    },
    p.env.CLOUDFLARE_STAGING_API_TOKEN
  );
  return { p, world };
}

test('a verified pair with unchanged protection publishes exactly once', async (t) => {
  const { p, world } = await webPublisher(t);
  await p.run();
  assert.equal(p.state.writes, 1);
  assert.equal(p.getLedger().entries[0].state, 'activated');
  assert.ok(world.vercelReads >= 4, 'fresh Vercel recheck ran before upload');
  assert.equal(
    world.nextLedgerWrites,
    0,
    'the Worker publisher never writes the Next ledger'
  );
});

for (const [label, mutate, message] of [
  [
    'the Next entry is only deployed',
    (w) => {
      w.nextEntry.state = 'deployed';
      delete w.nextEntry.verifyRunId;
    },
    /not verified/,
  ],
  [
    'the verified deployment differs',
    (w) => {
      w.nextEntry.deploymentId = 'dpl_otherdeploy1';
    },
    /differs from the verified/,
  ],
  [
    'the verified origin differs',
    (w) => {
      w.nextEntry.origin = 'https://tuturuuu-web-staging-other.vercel.app';
    },
    /origin differs/,
  ],
  [
    'no entry exists for the SHA',
    (w) => {
      w.nextEntry = null;
    },
    /No Web Next ledger entry/,
  ],
  [
    'the project id differs',
    (_w, p) => {
      p.env.VERCEL_WEB_STAGING_PROJECT_ID = 'prj_otherproject';
    },
    /scope mismatch/,
  ],
]) {
  test(`(a) refuses before any ledger write when ${label}`, async (t) => {
    const { p, world } = await webPublisher(t, mutate);
    await assert.rejects(p.run, message);
    assert.equal(p.state.writes, 0);
    assert.equal(p.state.ledgerQueries, 0);
    assert.equal(world.nextLedgerWrites, 0);
  });
}

for (const [label, mutate, message] of [
  [
    'protection drops to previews only',
    (w) => {
      w.project.ssoProtection.deploymentType = 'preview';
    },
    /ALL deployments/,
  ],
  [
    'a shareable link appears',
    (w) => {
      w.project.protectionBypass.share = { scope: 'shareable-link' };
    },
    /shareable links/,
  ],
  [
    'the bypass secret rotates away',
    (w) => {
      w.project.protectionBypass = {
        ['c'.repeat(32)]: { scope: 'automation-bypass' },
      };
    },
    /differs from the Worker secret/,
  ],
  [
    'an alias serves the image optimizer',
    (w) => {
      w.aliases.aliases.push({
        alias: 'tuturuuu-web-staging-git-main-fixture.vercel.app',
      });
      w.openPath = '/_next/image';
    },
    /N16/,
  ],
  [
    'monitoring opens',
    (w) => {
      w.openPath = '/monitoring';
    },
    /N16/,
  ],
  [
    'a custom domain is attached to the project',
    (w) => {
      w.domains.domains.push({ name: 'web-next.staging.tutur3u.com' });
    },
    /custom domain/,
  ],
]) {
  test(`(b) refuses the upload when ${label} after verification`, async (t) => {
    const { p } = await webPublisher(t, mutate);
    await assert.rejects(p.run, message);
    assert.equal(p.state.writes, 0, 'no upload');
    assert.equal(
      p.getLedger().entries[0].state,
      'failed',
      'admission consumed, nothing serving changed'
    );
  });
}

test('the Web admission must name the sealed Next deployment', async (t) => {
  const { p } = await webPublisher(t, (_w, pub) => {
    const admission = JSON.parse(pub.env.WAVE1_STAGING_PUBLICATION_ADMISSION);
    delete admission.nextDeploymentId;
    pub.env.WAVE1_STAGING_PUBLICATION_ADMISSION = JSON.stringify(admission);
  });
  await assert.rejects(p.run);
  assert.equal(p.state.writes, 0);
});
