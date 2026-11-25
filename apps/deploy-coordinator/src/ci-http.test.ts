import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CI_LIMITS, type CiOperation, runCiOperation } from './ci-registry';
import { MemoryCiStore } from './ci-store';
import { handle, resetExhaustedForTests, type RouterEnv } from './http';
import { AUDIENCE, githubSigner, REPOSITORY_ID } from './test-support';

const OPERATOR = 'operator-secret-'.repeat(4);
const SHA = 'c'.repeat(40);
const WORKFLOW =
  'tutur3u/platform/.github/workflows/ci-register.yaml@refs/heads/main';
let signer: Awaited<ReturnType<typeof githubSigner>>;
let store: MemoryCiStore;
let calls: string[];
let enabled: boolean;
let ciEnabled: boolean;

const env = (): RouterEnv => ({
  enabled,
  ciEnabled,
  audience: AUDIENCE,
  repositoryId: REPOSITORY_ID,
  operatorToken: OPERATOR,
  keys: async (kid) => (kid === signer.jwk.kid ? signer.jwk : null),
  now: Date.now,
  call: async () => {
    throw new Error('environment objects are not used by these tests');
  },
  ciCall: async (operation: CiOperation) => {
    calls.push(operation.op);
    return runCiOperation(store, (work) => work(), operation, Date.now());
  },
});

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
const REGISTRATIONS = '/v1/ci/main/registrations';

const ciToken = (claims: Record<string, unknown> = {}) =>
  signer.sign({
    ref: 'refs/heads/main',
    sha: SHA,
    run_id: '4242',
    run_attempt: '2',
    job_workflow_ref: WORKFLOW,
    workflow_ref: WORKFLOW,
    ...claims,
  });

const body = (overrides: Record<string, unknown> = {}) => ({
  sha: SHA,
  before: 'b'.repeat(40),
  base: null,
  plan: [
    {
      workflow: 'type-check.yaml',
      run: true,
      reason: 'type-check.yaml uses static tuturuuu.ts gating',
      closureKey: 'f'.repeat(32),
    },
    {
      workflow: 'codeql.yml',
      run: false,
      reason: 'no changed path matches the push filter',
    },
  ],
  ...overrides,
});

const register = async (
  overrides: Record<string, unknown> = {},
  claims: Record<string, unknown> = {}
) =>
  request(REGISTRATIONS, {
    token: await ciToken(claims),
    body: body(overrides),
  });

beforeAll(async () => {
  signer = await githubSigner();
});
beforeEach(() => {
  store = new MemoryCiStore();
  calls = [];
  enabled = true;
  ciEnabled = true;
  resetExhaustedForTests();
});

describe('CI registration', () => {
  it('records the plan with run identity taken from the token', async () => {
    const response = await register();
    expect(response.status).toBe(200);
    const { registration, created } = await response.json();
    expect(created).toBe(true);
    expect(registration).toMatchObject({
      sha: SHA,
      before: 'b'.repeat(40),
      base: null,
      runId: 4242,
      runAttempt: 2,
      actor: 'github:release-bot',
      logsUrl:
        'https://github.com/tutur3u/platform/actions/runs/4242/attempts/2',
    });
    expect(registration.plan[1]).toEqual({
      workflow: 'codeql.yml',
      run: false,
      reason: 'no changed path matches the push filter',
      closureKey: null,
    });
  });

  it('answers a repeat with the stored record and writes nothing', async () => {
    await register();
    const before = structuredClone([...store.registrations.values()]);
    const repeat = await register({ base: 'd'.repeat(40) }, { run_id: '9' });
    expect((await repeat.json()).created).toBe(false);
    expect([...store.registrations.values()]).toEqual(before);
    expect(store.budget.get(new Date().toISOString().slice(0, 10))).toBe(1);
  });

  it.each([
    [
      'a workflow other than ci-register.yaml',
      {
        job_workflow_ref: WORKFLOW.replace('ci-register', 'type-check'),
        workflow_ref: WORKFLOW.replace('ci-register', 'type-check'),
      },
      'BAD_WORKFLOW',
    ],
    [
      'ci-register.yaml called from another workflow',
      { workflow_ref: WORKFLOW.replace('ci-register', 'caller') },
      'BAD_WORKFLOW',
    ],
    [
      'the production ref',
      {
        ref: 'refs/heads/production',
        job_workflow_ref: WORKFLOW.replace('main', 'production'),
        workflow_ref: WORKFLOW.replace('main', 'production'),
      },
      'BAD_REF',
    ],
    ['a feature branch', { ref: 'refs/heads/feature' }, 'BAD_REF'],
    [
      'a workflow_dispatch event',
      { event_name: 'workflow_dispatch' },
      'BAD_EVENT',
    ],
    ['a schedule event', { event_name: 'schedule' }, 'BAD_EVENT'],
  ])('rejects %s', async (_name, claims, reason) => {
    const response = await register({}, claims);
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe(reason);
    expect(calls).toEqual([]);
  });

  it('rejects pull request events and other repositories at verification', async () => {
    for (const claims of [
      { event_name: 'pull_request' },
      { repository_id: '1' },
    ]) {
      const response = await register({}, claims);
      expect(response.status).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it('rejects missing and malformed tokens', async () => {
    for (const token of [undefined, 'not-a-jwt', OPERATOR]) {
      const response = await request(REGISTRATIONS, { token, body: body() });
      expect(response.status).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it('requires the token sha and a well-formed plan', async () => {
    const cases: Array<Record<string, unknown>> = [
      { sha: 'd'.repeat(40) },
      { sha: undefined },
      { before: 'zz' },
      { base: 'short' },
      { plan: [] },
      { plan: 'type-check.yaml' },
      { plan: [{ workflow: '../x.yaml', run: true, reason: 'r' }] },
      { plan: [{ workflow: 'a.yaml', run: 'yes', reason: 'r' }] },
      { plan: [{ workflow: 'a.yaml', run: true, reason: '' }] },
      { plan: [{ workflow: 'a.yaml', run: true, reason: 'x'.repeat(121) }] },
      { plan: [{ workflow: 'a.yaml', run: true, reason: 'line\nbreak' }] },
      {
        plan: [
          {
            workflow: 'a.yaml',
            run: true,
            reason: 'r',
            closureKey: 'G'.repeat(8),
          },
        ],
      },
      {
        plan: [
          {
            workflow: 'a.yaml',
            run: true,
            reason: 'r',
            closureKey: 'a'.repeat(65),
          },
        ],
      },
      {
        plan: [
          { workflow: 'a.yaml', run: true, reason: 'r' },
          { workflow: 'a.yaml', run: false, reason: 'r' },
        ],
      },
      {
        plan: Array.from(
          { length: CI_LIMITS.maxPlanEntries + 1 },
          (_, index) => ({ workflow: `w${index}.yaml`, run: true, reason: 'r' })
        ),
      },
    ];
    for (const overrides of cases) {
      const response = await register(overrides);
      expect(response.status, JSON.stringify(overrides).slice(0, 80)).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('caps the body at 16 KiB', async () => {
    const plan = Array.from({ length: 120 }, (_, index) => ({
      workflow: `workflow-${index}-${'x'.repeat(40)}.yaml`,
      run: true,
      reason: 'r'.repeat(120),
      closureKey: 'a'.repeat(64),
    }));
    const response = await register({ plan });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Body too large');
  });

  it('answers 503 without reaching the object when either switch is off', async () => {
    ciEnabled = false;
    expect((await register()).status).toBe(503);
    ciEnabled = true;
    enabled = false;
    const off = await register();
    expect(off.status).toBe(503);
    expect((await off.json()).error).toBe('COORDINATOR_OFF');
    expect(calls).toEqual([]);
  });

  it('honours the durable stop fence', async () => {
    const stop = await request('/v1/ci/main/stop', {
      ...op,
      body: { reason: 'drill' },
    });
    expect((await stop.json()).stopped).toBe(true);
    const rejected = await register();
    expect(rejected.status).toBe(503);
    expect((await rejected.json()).error).toBe('STOPPED');
    expect(store.registrations.size).toBe(0);
    expect(store.budget.size).toBe(0);
    await request('/v1/ci/main/resume', { ...op, body: {} });
    expect((await register()).status).toBe(200);
  });

  it('answers 429 past the budget, then without reaching the object', async () => {
    const day = new Date().toISOString().slice(0, 10);
    store.budget.set(day, CI_LIMITS.dailyBudget);
    const first = await register();
    expect(first.status).toBe(429);
    expect((await first.json()).error).toBe('BUDGET_EXHAUSTED');
    expect(store.registrations.size).toBe(0);
    calls = [];
    expect((await register()).status).toBe(429);
    expect(calls).toEqual([]);
    // Operator reads stay available.
    expect((await request('/v1/ci/main', op)).status).toBe(200);
  });
});

describe('CI operator routes', () => {
  it('hides every operator route without the operator token', async () => {
    for (const path of [
      '/v1/ci/main',
      REGISTRATIONS,
      `${REGISTRATIONS}/${SHA}`,
    ]) {
      expect((await request(path)).status).toBe(404);
      expect((await request(path, { token: 'wrong', actor: 'u' })).status).toBe(
        404
      );
    }
    expect(
      (await request('/v1/ci/main/stop', { body: { reason: 'x' } })).status
    ).toBe(404);
    expect(calls).toEqual([]);
  });

  it('reads status, the newest registrations and one SHA', async () => {
    await register();
    const status = await (await request('/v1/ci/main', op)).json();
    expect(status).toMatchObject({
      meta: { stopped: false },
      registrations: 1,
      budget: { used: 1, limit: CI_LIMITS.dailyBudget },
    });
    const listed = await (await request(`${REGISTRATIONS}?limit=5`, op)).json();
    expect(listed.registrations.map((r: any) => r.sha)).toEqual([SHA]);
    expect((await request(`${REGISTRATIONS}/${SHA}`, op)).status).toBe(200);
    const missing = await request(`${REGISTRATIONS}/${'e'.repeat(40)}`, op);
    expect(missing.status).toBe(404);
    expect((await request(`${REGISTRATIONS}/not-a-sha`, op)).status).toBe(404);
  });

  it('bounds the list limit', async () => {
    for (const limit of ['0', '101', '-1', 'ten', '1e2'])
      expect(
        (await request(`${REGISTRATIONS}?limit=${limit}`, op)).status
      ).toBe(400);
    expect((await request(`${REGISTRATIONS}?limit=100`, op)).status).toBe(200);
    expect(calls).toEqual(['list']);
  });

  it('serves only the main registry', async () => {
    expect((await request('/v1/ci/production', op)).status).toBe(404);
    expect((await request('/v1/ci', op)).status).toBe(404);
    expect(
      (await request(REGISTRATIONS, { ...op, method: 'DELETE' })).status
    ).toBe(404);
  });
});
