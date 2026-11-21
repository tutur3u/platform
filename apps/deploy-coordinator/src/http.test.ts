import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from './core';
import { runOperation } from './environment-service';
import { handle, resetExhaustedForTests, type RouterEnv } from './http';
import { MemoryStore } from './store';
import { AUDIENCE, githubSigner, REPOSITORY_ID } from './test-support';

const OPERATOR = 'operator-secret-'.repeat(4);
let signer: Awaited<ReturnType<typeof githubSigner>>;
let stores: Map<string, MemoryStore>;
let calls: string[];
let enabled: boolean;

const env = (): RouterEnv => ({
  enabled,
  audience: AUDIENCE,
  repositoryId: REPOSITORY_ID,
  operatorToken: OPERATOR,
  keys: async (kid) => (kid === signer.jwk.kid ? signer.jwk : null),
  now: Date.now,
  call: async (name, context, operation) => {
    calls.push(`${name}:${operation.op}`);
    if (!stores.has(name)) stores.set(name, new MemoryStore());
    return runOperation(
      stores.get(name)!,
      (work) => work(),
      context,
      operation,
      Date.now(),
      () => crypto.randomUUID()
    );
  },
});

// Test responses are read loosely; the router's shapes are asserted below.
type LooseResponse = Omit<Response, 'json'> & { json(): Promise<any> };

const request = (
  path: string,
  init: { method?: string; token?: string; actor?: string; body?: unknown } = {}
) =>
  handle(
    new Request(`https://coordinator.test${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.actor ? { 'X-Deploy-Actor': init.actor } : {}),
        'Content-Type': 'application/json',
      },
      body:
        init.body === undefined
          ? undefined
          : typeof init.body === 'string'
            ? init.body
            : JSON.stringify(init.body),
    }),
    env()
  ) as Promise<LooseResponse>;

const op = { token: OPERATOR, actor: 'user-1' };
const PROD = '/v1/projects/calendar/environments/production';
const STAGING = '/v1/projects/calendar/environments/staging';

beforeAll(async () => {
  signer = await githubSigner();
});
beforeEach(() => {
  stores = new Map();
  calls = [];
  enabled = true;
  resetExhaustedForTests();
});

describe('router', () => {
  it('serves health and hides unknown or unauthenticated routes', async () => {
    expect(await (await request('/health')).json()).toEqual({ ok: true });
    expect((await request('/health', { method: 'POST' })).status).toBe(404);
    expect((await request('/v1/projects')).status).toBe(404);
    expect(
      (await request('/v1/projects', { token: 'wrong', actor: 'u' })).status
    ).toBe(404);
    expect(
      (await request('/v1/projects/unknown/environments/production', op)).status
    ).toBe(404);
    expect(
      (await request('/v1/projects/calendar/environments/qa', op)).status
    ).toBe(404);
    const listed = await request('/v1/projects', op);
    expect(listed.headers.get('cache-control')).toBe('no-store');
    expect((await listed.json()).projects.length).toBeGreaterThan(30);
    // The catalog listing never touches a Durable Object.
    expect(calls).toEqual([]);
  });

  it('runs the CI lifecycle with run-bound OIDC tokens', async () => {
    const token = await signer.sign();
    expect((await request(`${PROD}/deployments`, { body: {} })).status).toBe(
      401
    );
    const created = await request(`${PROD}/deployments`, {
      token,
      body: {
        plan: {
          source: 'affected-planner',
          digest: `sha256:${'b'.repeat(64)}`,
          url: 'https://github.com/tutur3u/platform/actions/runs/1',
        },
      },
    });
    expect(created.status).toBe(200);
    const { deployment } = await created.json();
    expect(deployment).toMatchObject({
      sha: 'a'.repeat(40),
      ref: 'refs/heads/production',
      runId: 1000,
      logsUrl:
        'https://github.com/tutur3u/platform/actions/runs/1000/attempts/1',
      actor: 'github:release-bot',
    });
    const path = `${PROD}/deployments/${deployment.id}`;

    const otherRun = await signer.sign({ run_id: '2000' });
    expect(
      (
        await request(`${path}/claim`, {
          token: otherRun,
          body: { workerId: 'w' },
        })
      ).status
    ).toBe(403);

    const claim = await (
      await request(`${path}/claim`, { token, body: { workerId: 'w' } })
    ).json();
    expect(claim.decision).toBe('granted');
    const grant = {
      attemptId: claim.grant.attemptId,
      epoch: claim.grant.epoch,
    };
    expect(
      (await request(`${path}/heartbeat`, { token, body: { grant } })).status
    ).toBe(200);
    const done = await request(`${path}/complete`, {
      token,
      body: {
        grant,
        outcome: 'succeeded',
        url: 'https://calendar.tuturuuu.com',
        artifact: { kind: 'vercel', id: 'dpl_123' },
      },
    });
    expect(await done.json()).toMatchObject({
      status: 'succeeded',
      url: 'https://calendar.tuturuuu.com/',
      artifact: { kind: 'vercel', id: 'dpl_123', digest: null },
    });

    const snapshot = await (await request(PROD, op)).json();
    expect(snapshot.lanes[0].current.id).toBe(deployment.id);
  });

  it('rejects wrong refs, workflows, bodies and a disabled coordinator', async () => {
    const staging = await signer.sign();
    expect(
      (await request(`${STAGING}/deployments`, { token: staging, body: {} }))
        .status
    ).toBe(403);
    const token = await signer.sign();
    expect(
      (
        await request(`${PROD}/deployments`, {
          token,
          body: { sha: 'c'.repeat(40) },
        })
      ).status
    ).toBe(400);
    expect(
      (await request(`${PROD}/deployments`, { token, body: 'x'.repeat(9_000) }))
        .status
    ).toBe(400);
    expect(
      (
        await request(`${PROD}/deployments`, {
          token,
          body: { plan: { source: 'p', digest: 'md5:1' } },
        })
      ).status
    ).toBe(400);
    enabled = false;
    expect(
      (await request(`${PROD}/deployments`, { token, body: {} })).status
    ).toBe(503);
    expect(calls).toEqual([]);
  });

  it('refuses CI preview reports: no workflow reports one', async () => {
    const token = await signer.sign({
      ref: 'refs/heads/main',
      event_name: 'workflow_dispatch',
      job_workflow_ref:
        'tutur3u/platform/.github/workflows/vercel-preview-calendar.yaml@refs/heads/main',
    });
    const path = '/v1/projects/calendar/environments/preview/deployments';
    const refused = await request(path, {
      token,
      body: { sha: 'd'.repeat(40), lane: 'feature/x' },
    });
    expect(refused.status).toBe(403);
    expect((await refused.json()).message).toBe('BAD_WORKFLOW');
  });

  it('promotes a succeeded staging deployment through the operator API', async () => {
    // Staging reports from the native staging publisher on main, never from
    // the production workflow.
    const production = await signer.sign({
      ref: 'refs/heads/main',
      job_workflow_ref:
        'tutur3u/platform/.github/workflows/vercel-production-calendar.yaml@refs/heads/main',
    });
    const refused = await request(`${STAGING}/deployments`, {
      token: production,
      body: {},
    });
    expect(refused.status).toBe(403);
    expect((await refused.json()).message).toBe('BAD_WORKFLOW');
    const token = await signer.sign({
      ref: 'refs/heads/main',
      job_workflow_ref:
        'tutur3u/platform/.github/workflows/wave1-native-publish.yaml@refs/heads/main',
      workflow_ref:
        'tutur3u/platform/.github/workflows/calendar-cloudflare.yaml@refs/heads/main',
    });
    const { deployment } = await (
      await request(`${STAGING}/deployments`, { token, body: {} })
    ).json();
    const path = `${STAGING}/deployments/${deployment.id}`;
    const { grant } = await (
      await request(`${path}/claim`, { token, body: { workerId: 'w' } })
    ).json();
    await request(`${path}/complete`, {
      token,
      body: { grant, outcome: 'succeeded' },
    });
    expect((await request(`${path}/promote`, { body: {} })).status).toBe(404);
    const promoted = await (
      await request(`${path}/promote`, { ...op, body: {} })
    ).json();
    expect(promoted.deployment).toMatchObject({
      environment: 'production',
      kind: 'promotion',
      sourceDeploymentId: deployment.id,
      actor: 'user-1',
    });
    const resolved = await request(
      `${PROD}/deployments/${promoted.deployment.id}/resolve`,
      {
        ...op,
        body: { outcome: 'succeeded' },
      }
    );
    expect((await resolved.json()).closedBy).toBe('user-1');
  });

  it('remembers an exhausted budget instead of calling the object again', async () => {
    const token = await signer.sign();
    const { deployment } = await (
      await request(`${PROD}/deployments`, { token, body: {} })
    ).json();
    const store = stores.get('calendar:production')!;
    for (let index = 0; index < LIMITS.dailyBudget; index += 1)
      store.countRequest(new Date().toISOString().slice(0, 10), Infinity, true);
    const path = `${PROD}/deployments/${deployment.id}/claim`;
    expect(
      (await request(path, { token, body: { workerId: 'w' } })).status
    ).toBe(429);
    const before = calls.length;
    expect(
      (await request(path, { token, body: { workerId: 'w' } })).status
    ).toBe(429);
    expect(calls.length).toBe(before);
    // Operators can still stop the environment.
    expect(
      (await request(`${PROD}/stop`, { ...op, body: { reason: 'loop' } }))
        .status
    ).toBe(200);
  });

  it('stops reading a body at the byte cap without trusting Content-Length', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(1_024).fill(0x20);
    // An endless body with no declared length.
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const response = (await handle(
      new Request(`https://coordinator.test${PROD}/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPERATOR}`, 'X-Deploy-Actor': 'u' },
        body,
        duplex: 'half',
      } as RequestInit),
      env()
    )) as LooseResponse;
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Body too large');
    expect(pulled).toBeLessThan(16);
  });
});
