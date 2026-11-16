/**
 * `live` family end to end in workerd (Miniflare): signed HTTPS RPC, the
 * single-partition SQLite Durable Object, the family op budget and the
 * operator stop fence. No Cloudflare network or account is used.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type AbuseGuardClient,
  createAbuseGuardClient,
  createHttpGuardTransport,
  type GuardLiveReserveInput,
} from '@tuturuuu/utils/abuse-guard/client';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vite-plus/test';

const SECRET = 'live-test-secret-'.padEnd(48, 'x');
const OPERATOR = 'live-test-operator-'.padEnd(48, 'y');
const PEPPER = 'live-test-pepper-'.padEnd(48, 'z');
const ORIGIN = 'http://localhost';

let workDir: string;
let scriptPath: string;
let mf: Miniflare | undefined;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'abuse-guard-live-test-'));
  scriptPath = join(workDir, 'worker.mjs');
  await build({
    entryPoints: [resolve(import.meta.dirname, 'worker.ts')],
    outfile: scriptPath,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'import'],
    external: ['cloudflare:*'],
    logLevel: 'silent',
  });
});

afterEach(async () => {
  await mf?.dispose();
  mf = undefined;
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function start(familyBudgets = '') {
  mf = new Miniflare({
    durableObjectsPersist: false,
    workers: [
      {
        name: 'guard',
        modules: true,
        scriptPath,
        modulesRoot: workDir,
        compatibilityDate: '2026-07-01',
        durableObjects: {
          GUARD_SUBJECT: { className: 'GuardSubject', useSQLite: true },
          GUARD_CONTROL: { className: 'GuardControl', useSQLite: true },
        },
        bindings: {
          ABUSE_GUARD_SECRETS: SECRET,
          ABUSE_GUARD_OPERATOR_TOKEN: OPERATOR,
          ABUSE_GUARD_DAILY_OP_BUDGET: '100000',
          ABUSE_GUARD_FAMILY_BUDGETS: familyBudgets,
        },
      },
    ],
  });
  await mf.ready;
  return mf;
}

function client(runtime: Miniflare, secret = SECRET): AbuseGuardClient {
  return createAbuseGuardClient({
    family: 'live',
    pepper: PEPPER,
    transport: createHttpGuardTransport({
      url: ORIGIN,
      secret,
      timeoutMs: 10_000,
      fetch: ((url: URL, init: RequestInit) =>
        runtime.dispatchFetch(url, init as never)) as unknown as typeof fetch,
    }),
  });
}

const input = (
  actor: string,
  overrides: Partial<GuardLiveReserveInput> = {}
): GuardLiveReserveInput => ({
  partition: 'live-mint:v2',
  actor,
  budget: 'free-budget',
  actorLimit: 10,
  concurrentLimit: 1,
  durationMs: 180_000,
  free: true,
  limit: 50_000_000,
  rate: 36_800,
  ...overrides,
});

async function control(runtime: Miniflare, path: string, method = 'GET') {
  const response = await runtime.dispatchFetch(`${ORIGIN}/control/${path}`, {
    method,
    headers: { authorization: `Bearer ${OPERATOR}` },
  });
  return { status: response.status, body: (await response.json()) as any };
}

describe('live family in workerd', () => {
  it('admits exactly the budget under concurrent first-come-first-served mints', async () => {
    const runtime = await start();
    const guard = client(runtime);
    // Five 180 s FREE leases (552_000) fit in 600_000; the sixth would not.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        guard.liveReserve(
          input(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, {
            limit: 600_000,
          })
        )
      )
    );
    expect(results.filter((result) => result.ok)).toHaveLength(5);
    const denied = results.filter((result) => !result.ok);
    expect(denied).toHaveLength(15);
    expect(
      denied.every((result) => !result.ok && result.reason === 'budget')
    ).toBe(true);
    // The 100% alert is claimed by exactly one request.
    expect(results.filter((result) => result.alert & 2)).toHaveLength(1);
  });

  it('replays a duplicated mint id without charging twice', async () => {
    const runtime = await start();
    const guard = client(runtime);
    const mint = crypto.randomUUID();
    const first = await guard.liveReserve(
      input('actor-replay', { operationId: mint })
    );
    const duplicate = await guard.liveReserve(
      input('actor-replay', { operationId: mint })
    );
    expect(duplicate).toEqual(first);
    const next = await guard.liveReserve(input('actor-other'));
    expect(next).toMatchObject({ ok: true, spent: 220_800 });
  });

  it('rejects unsigned and forged requests before any Durable Object work', async () => {
    const runtime = await start();
    const unsigned = await runtime.dispatchFetch(`${ORIGIN}/v1/rpc`, {
      method: 'POST',
      body: '{}',
    });
    expect(unsigned.status).toBe(401);
    expect(unsigned.headers.get('access-control-allow-origin')).toBeNull();
    expect(
      (await runtime.dispatchFetch(`${ORIGIN}/v1/rpc`, { method: 'GET' }))
        .status
    ).toBe(405);
    await expect(
      client(runtime, 'forged-secret-'.padEnd(48, 'f')).liveReserve(
        input('actor')
      )
    ).rejects.toMatchObject({ code: 'unauthorized' });
    // Nothing was admitted or charged to the family op budget.
    expect((await control(runtime, 'state')).body.families).toEqual({});
  });

  it('stops the family when its op share is exhausted, warning at 80%', async () => {
    const runtime = await start('live=5');
    const guard = client(runtime);
    for (let index = 0; index < 4; index += 1) {
      await guard.liveReserve(input(`actor-${index}`, { free: false }));
    }
    expect((await control(runtime, 'state')).body.families.live).toMatchObject({
      used: 4,
      budget: 5,
      warned: true,
      stopped: false,
    });
    await guard.liveReserve(input('actor-4', { free: false }));
    await expect(guard.liveReserve(input('actor-5'))).rejects.toMatchObject({
      code: 'guard_stopped',
    });
  });

  it('fails the very next request closed after an operator stop', async () => {
    const runtime = await start();
    const guard = client(runtime);
    expect((await guard.liveReserve(input('actor'))).ok).toBe(true);
    expect((await control(runtime, 'stop', 'POST')).body.stopped).toBe(true);
    // Idempotent: a repeated stop keeps the fence set.
    expect((await control(runtime, 'stop', 'POST')).body.stopped).toBe(true);
    await expect(guard.liveReserve(input('actor-2'))).rejects.toMatchObject({
      code: 'guard_stopped',
    });
    expect((await control(runtime, 'resume', 'POST')).body.stopped).toBe(false);
    expect((await guard.liveReserve(input('actor-2'))).ok).toBe(true);
  });
});
