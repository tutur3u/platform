import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  begin,
  createClient,
  finish,
  heartbeat,
  readConfig,
} from './deploy-coordinator-client.mjs';

const ENV = {
  DEPLOY_COORDINATOR_MODE: 'enforce',
  DEPLOY_COORDINATOR_ORIGIN: 'https://coordinator.test/',
  DC_PROJECT: 'calendar',
  DC_ENVIRONMENT: 'production',
  DC_MAX_WAIT_MINUTES: '2',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://tokens.test/request?api-version=2',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token',
  GITHUB_RUN_ID: '42',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_JOB: 'deploy',
};

// A scripted coordinator: each path answers from a queue of responses.
function fakeServer(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    const { pathname, search } = new URL(url);
    calls.push({ path: pathname + search, init });
    if (url.startsWith('https://tokens.test/')) {
      assert.match(url, /audience=tuturuuu-deploy-coordinator/);
      return new Response(JSON.stringify({ value: 'oidc-token' }));
    }
    const key = pathname.replace(/[0-9a-f-]{36}/, ':id');
    const queue = routes[`${init.method} ${key}`];
    assert.ok(queue?.length, `unexpected ${init.method} ${key}`);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
    });
  };
  return { fetch, calls };
}

const ID = '11111111-1111-4111-8111-111111111111';
const PROD = '/v1/projects/calendar/environments/production';
const created = (status = 'queued') => ({
  body: { deployment: { id: ID, status }, created: true },
});
const grant = {
  jobId: ID,
  attemptId: 'attempt-1',
  workerId: '42:1:deploy',
  epoch: 3,
  targetLockId: 'calendar:production:default',
  stopRevision: 0,
  leaseDeadline: '2026-11-20T12:05:00.000Z',
};

function run(env, routes) {
  const server = fakeServer(routes);
  const logs = [];
  const slept = [];
  let clock = 0;
  const sleep = async (ms) => {
    slept.push(ms);
    clock += ms;
  };
  const client = createClient({
    env: { ...ENV, ...env },
    fetch: server.fetch,
    sleep,
    log: (line) => logs.push(line),
  });
  const state = { value: null, heartbeats: 0 };
  const deps = {
    now: () => clock,
    sleep,
    writeState: (value) => {
      state.value = value;
    },
    startHeartbeat: () => {
      state.heartbeats += 1;
    },
  };
  return { client, deps, server, logs, slept, state };
}

describe('deploy coordinator client', () => {
  test('defaults to off and never calls the network', async () => {
    assert.equal(readConfig({}).mode, 'off');
    assert.equal(readConfig({ DEPLOY_COORDINATOR_MODE: 'yes' }).mode, 'off');
    const h = run({ DEPLOY_COORDINATOR_MODE: '' }, {});
    assert.deepEqual(await begin(h.client, h.deps), {
      publish: true,
      deploymentId: '',
      grant: null,
    });
    assert.equal(h.server.calls.length, 0);
  });

  test('registers, waits for the lane and starts the heartbeat', async () => {
    const h = run(
      {},
      {
        [`POST ${PROD}/deployments`]: [created()],
        [`POST ${PROD}/deployments/:id/claim`]: [
          { body: { decision: 'wait', retryAfterSeconds: 5, blockedBy: 'x' } },
          { body: { decision: 'granted', grant } },
        ],
      }
    );
    const result = await begin(h.client, h.deps);
    assert.deepEqual(result, { publish: true, deploymentId: ID, grant });
    // The poll interval never drops below the floor.
    assert.deepEqual(h.slept, [20_000]);
    assert.equal(h.state.heartbeats, 1);
    assert.deepEqual(h.state.value.grant, grant);
    const claim = h.server.calls.find((call) => call.path.endsWith('/claim'));
    assert.equal(claim.init.headers.Authorization, 'Bearer oidc-token');
    assert.deepEqual(JSON.parse(claim.init.body), { workerId: '42:1:deploy' });
  });

  test('skips publication when superseded or held in enforce mode', async () => {
    const superseded = run(
      {},
      {
        [`POST ${PROD}/deployments`]: [created('superseded')],
      }
    );
    assert.equal(
      (await begin(superseded.client, superseded.deps)).publish,
      false
    );

    const held = run(
      {},
      {
        [`POST ${PROD}/deployments`]: [created()],
        [`POST ${PROD}/deployments/:id/claim`]: [
          {
            body: {
              decision: 'held',
              retryAfterSeconds: 20,
              reason: 'rollback:x',
            },
          },
        ],
        [`POST ${PROD}/deployments/:id/skip`]: [
          { body: { status: 'cancelled' } },
        ],
      }
    );
    assert.equal((await begin(held.client, held.deps)).publish, false);
    const skip = held.server.calls.find((call) => call.path.endsWith('/skip'));
    assert.deepEqual(JSON.parse(skip.init.body), { reason: 'SKIPPED_HELD' });
  });

  test('observe mode never blocks and closes a record it cannot claim', async () => {
    const h = run(
      { DEPLOY_COORDINATOR_MODE: 'observe' },
      {
        [`POST ${PROD}/deployments`]: [created('superseded')],
      }
    );
    assert.equal((await begin(h.client, h.deps)).publish, true);
    const busy = run(
      { DEPLOY_COORDINATOR_MODE: 'observe' },
      {
        [`POST ${PROD}/deployments`]: [created()],
        [`POST ${PROD}/deployments/:id/claim`]: [
          {
            body: {
              decision: 'stopped',
              retryAfterSeconds: 20,
              stopRevision: 1,
            },
          },
        ],
        [`POST ${PROD}/deployments/:id/skip`]: [{ body: {} }],
      }
    );
    assert.equal((await begin(busy.client, busy.deps)).publish, true);
    assert.deepEqual(busy.slept, []);
    const held = run(
      { DEPLOY_COORDINATOR_MODE: 'observe' },
      {
        [`POST ${PROD}/deployments`]: [created()],
        [`POST ${PROD}/deployments/:id/claim`]: [
          { body: { decision: 'held', retryAfterSeconds: 20, reason: null } },
        ],
        [`POST ${PROD}/deployments/:id/skip`]: [{ body: {} }],
      }
    );
    assert.equal((await begin(held.client, held.deps)).publish, true);
    const heldSkip = held.server.calls.find((call) =>
      call.path.endsWith('/skip')
    );
    assert.deepEqual(JSON.parse(heldSkip.init.body), {
      reason: 'PUBLISHED_UNCOORDINATED',
    });
    const closed = busy.server.calls.find((call) =>
      call.path.endsWith('/skip')
    );
    assert.deepEqual(JSON.parse(closed.init.body), {
      reason: 'PUBLISHED_UNCOORDINATED',
    });
  });

  test('falls open on outages, budgets and a bounded wait', async () => {
    const outage = run(
      {},
      {
        [`POST ${PROD}/deployments`]: [new Error('ECONNRESET')],
      }
    );
    assert.equal((await begin(outage.client, outage.deps)).publish, true);
    // Three bounded attempts with backoff, then fall open.
    assert.equal(
      outage.server.calls.filter((call) => call.path.endsWith('/deployments'))
        .length,
      3
    );
    assert.deepEqual(outage.slept, [1_000, 2_000]);

    const budget = run(
      {},
      {
        [`POST ${PROD}/deployments`]: [
          { status: 429, body: { error: 'BUDGET_EXHAUSTED' } },
        ],
      }
    );
    assert.equal((await begin(budget.client, budget.deps)).publish, true);
    assert.equal(
      budget.server.calls.filter((c) => !c.path.startsWith('/request')).length,
      1
    );

    const stopped = run(
      {},
      {
        [`POST ${PROD}/deployments`]: [created()],
        [`POST ${PROD}/deployments/:id/claim`]: [
          {
            body: {
              decision: 'stopped',
              retryAfterSeconds: 60,
              stopRevision: 1,
            },
          },
        ],
        [`POST ${PROD}/deployments/:id/skip`]: [{ body: {} }],
      }
    );
    assert.equal((await begin(stopped.client, stopped.deps)).publish, true);
    assert.ok(stopped.server.calls.some((call) => call.path.endsWith('/skip')));
    assert.equal(
      stopped.slept.reduce((sum, ms) => sum + ms, 0) <= 120_000,
      true
    );

    const noToken = run(
      { ACTIONS_ID_TOKEN_REQUEST_URL: '', ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' },
      {}
    );
    assert.equal((await begin(noToken.client, noToken.deps)).publish, true);
    assert.match(noToken.logs.join('\n'), /NO_ID_TOKEN/);
  });

  test('heartbeat stops on refusal and records the fence', async () => {
    const h = run(
      {},
      {
        [`POST ${PROD}/deployments/:id/heartbeat`]: [
          { body: grant },
          { status: 409, body: { error: 'LEASE_EXPIRED' } },
        ],
      }
    );
    let fenced = null;
    const result = await heartbeat(h.client, {
      now: h.deps.now,
      sleep: h.deps.sleep,
      readState: () => ({ deploymentId: ID, grant }),
      markFenced: (code) => {
        fenced = code;
      },
    });
    assert.equal(result, 'fenced');
    assert.equal(fenced, 'LEASE_EXPIRED');

    const done = run({}, {});
    assert.equal(
      await heartbeat(done.client, {
        now: done.deps.now,
        sleep: done.deps.sleep,
        readState: () => null,
        markFenced: () => assert.fail('not fenced'),
      }),
      'finished'
    );
  });

  test('finish reports the job outcome with the grant', async () => {
    for (const [jobStatus, outcome] of [
      ['success', 'succeeded'],
      ['failure', 'failed'],
      ['cancelled', 'failed'],
    ]) {
      const h = run(
        {
          DC_JOB_STATUS: jobStatus,
          DC_URL: 'https://calendar.tuturuuu.com',
          DC_ARTIFACT_ID: 'dpl_1',
          DC_ARTIFACT_KIND: 'vercel',
        },
        {
          [`POST ${PROD}/deployments/:id/complete`]: [
            { body: { status: outcome } },
          ],
        }
      );
      let stopped = null;
      let removed = false;
      assert.equal(
        await finish(h.client, {
          readState: () => ({ deploymentId: ID, grant, pid: 7 }),
          removeState: () => {
            removed = true;
          },
          stopHeartbeat: (state) => {
            stopped = state.pid;
          },
        }),
        outcome
      );
      assert.equal(stopped, 7);
      assert.equal(removed, true);
      const call = h.server.calls.find((entry) =>
        entry.path.endsWith('/complete')
      );
      assert.deepEqual(JSON.parse(call.init.body), {
        grant: { attemptId: 'attempt-1', epoch: 3 },
        outcome,
        url: 'https://calendar.tuturuuu.com',
        artifact: { kind: 'vercel', id: 'dpl_1', digest: null },
        failureReason: outcome === 'failed' ? 'JOB_FAILED' : null,
      });
    }
  });

  test('preview registration sends the preview ref and sha', async () => {
    const h = run(
      {
        DC_ENVIRONMENT: 'preview',
        DC_LANE: 'feature/x',
        DC_SHA: 'a'.repeat(40),
      },
      {
        '/v1/projects/calendar/environments/preview/deployments': [],
        'POST /v1/projects/calendar/environments/preview/deployments': [
          created('superseded'),
        ],
      }
    );
    await begin(h.client, h.deps);
    const call = h.server.calls.find((entry) =>
      entry.path.endsWith('/deployments')
    );
    assert.deepEqual(JSON.parse(call.init.body), {
      plan: null,
      sha: 'a'.repeat(40),
      lane: 'feature/x',
    });
  });
});
