import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type AbuseGuardClient,
  createAbuseGuardClient,
  createBindingGuardTransport,
  createHttpGuardTransport,
} from '@tuturuuu/utils/abuse-guard/client';
import { hashGuardValue } from '@tuturuuu/utils/abuse-guard/crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const OPERATOR = 'test-operator-'.padEnd(48, 'y');
const PEPPER = 'test-pepper-'.padEnd(48, 'z');
const ORIGIN = 'http://localhost';

let workDir: string;
let scriptPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'abuse-guard-test-'));
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

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function createRuntime(
  options: {
    familyBudgets?: string;
    persist?: string;
    secrets?: string;
    operator?: string;
  } = {}
) {
  return new Miniflare({
    durableObjectsPersist: options.persist ?? false,
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
          ABUSE_GUARD_SECRETS:
            options.secrets ?? `${SECRET},${'old-secret-'.padEnd(48, 'o')}`,
          ABUSE_GUARD_OPERATOR_TOKEN: options.operator ?? OPERATOR,
          ABUSE_GUARD_CONTROL_CACHE_MS: '0',
          ABUSE_GUARD_DAILY_OP_BUDGET: '100000',
          ABUSE_GUARD_FAMILY_BUDGETS: options.familyBudgets ?? '',
        },
      },
      {
        name: 'caller',
        modules: true,
        compatibilityDate: '2026-07-01',
        script: `export default {
          async fetch(request, env) {
            return Response.json(await env.GUARD.run(await request.json()));
          },
        };`,
        serviceBindings: {
          GUARD: { name: 'guard', entrypoint: 'AbuseGuardEntrypoint' },
        },
      },
    ],
  });
}

function httpClient(
  mf: Miniflare,
  family: 'offline' | 'replay' | 'password' = 'offline',
  secret = SECRET
): AbuseGuardClient {
  return createAbuseGuardClient({
    family,
    pepper: PEPPER,
    transport: createHttpGuardTransport({
      url: ORIGIN,
      secret,
      timeoutMs: 10_000,
      fetch: ((url: URL, init: RequestInit) =>
        mf.dispatchFetch(url, init as never)) as unknown as typeof fetch,
    }),
  });
}

async function bindingClient(mf: Miniflare): Promise<AbuseGuardClient> {
  const caller = await mf.getWorker('caller');
  return createAbuseGuardClient({
    family: 'password',
    pepper: PEPPER,
    transport: createBindingGuardTransport(
      {
        run: async (rpc) =>
          (
            await caller.fetch('http://caller/', {
              method: 'POST',
              body: JSON.stringify(rpc),
            })
          ).json(),
      },
      10_000
    ),
  });
}

async function control(mf: Miniflare, path: string, method = 'GET') {
  const response = await mf.dispatchFetch(`${ORIGIN}/control/${path}`, {
    method,
    headers: { authorization: `Bearer ${OPERATOR}` },
  });
  return { status: response.status, body: (await response.json()) as any };
}

describe('abuse-guard Worker in workerd', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    mf = createRuntime();
    await mf.ready;
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('rejects unauthenticated and malformed requests before any work', async () => {
    const unsigned = await mf.dispatchFetch(`${ORIGIN}/v1/rpc`, {
      method: 'POST',
      body: '{}',
    });
    expect(unsigned.status).toBe(401);

    const forged = httpClient(mf, 'offline', 'forged-secret-'.padEnd(48, 'f'));
    await expect(forged.get('k')).rejects.toMatchObject({
      code: 'unauthorized',
    });

    const oversized = await mf.dispatchFetch(`${ORIGIN}/v1/rpc`, {
      method: 'POST',
      body: 'x'.repeat(17 * 1024),
    });
    expect(oversized.status).toBe(413);

    expect((await mf.dispatchFetch(`${ORIGIN}/v1/rpc`)).status).toBe(405);
    expect((await mf.dispatchFetch(`${ORIGIN}/`)).status).toBe(404);
    const anonymousControl = await mf.dispatchFetch(`${ORIGIN}/control/stop`, {
      method: 'POST',
    });
    expect(anonymousControl.status).toBe(401);

    const state = await control(mf, 'state');
    // No family has admitted any work yet.
    expect(state.body).toMatchObject({ stopped: false, families: {} });
  });

  it('applies a replayed or duplicated signed request exactly once', async () => {
    const captured: { url: URL; init: RequestInit }[] = [];
    const client = createAbuseGuardClient({
      family: 'password',
      pepper: PEPPER,
      transport: createHttpGuardTransport({
        url: ORIGIN,
        secret: SECRET,
        timeoutMs: 10_000,
        fetch: ((url: URL, init: RequestInit) => {
          captured.push({ url, init });
          return mf.dispatchFetch(url, init as never);
        }) as unknown as typeof fetch,
      }),
    });
    const reserve = (receipt: string) =>
      client.reserve({
        partition: 'pwd:replay',
        budgets: [{ key: 'target', limit: 5, ttlMs: 900_000 }],
        receipt,
      });
    await expect(reserve('r1')).resolves.toMatchObject({
      ok: true,
      remaining: 4,
    });
    const { url, init } = captured[0]!;
    const original = await (await mf.dispatchFetch(url, init as never)).text();
    const replays = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const response = await mf.dispatchFetch(url, init as never);
        return { status: response.status, body: await response.text() };
      })
    );
    for (const replay of replays) {
      expect(replay).toEqual({ status: 200, body: original });
    }
    // Eleven replays later, a fresh reservation sees exactly one prior charge.
    await expect(reserve('r2')).resolves.toMatchObject({
      ok: true,
      remaining: 3,
    });
  });

  it('rejects a body that is not valid UTF-8 before verifying it', async () => {
    const response = await mf.dispatchFetch(`${ORIGIN}/v1/rpc`, {
      method: 'POST',
      body: new Uint8Array([0x7b, 0xff, 0x7d]),
    });
    expect(response.status).toBe(400);
  });

  it('keeps serving a partition after its cleanup alarm empties it', async () => {
    const client = httpClient(mf, 'offline');
    const key = 'offline:clearance:alarm';
    const namespace = await mf.getDurableObjectNamespace(
      'GUARD_SUBJECT',
      'guard'
    );
    const partition = await hashGuardValue(PEPPER, 'p:offline', key);
    const stub = namespace.get(
      namespace.idFromName(`offline:${partition}`)
    ) as unknown as {
      run(cmds: unknown[]): Promise<{ ok: boolean }>;
      runCleanup(): Promise<void>;
    };
    // Seed one short-lived record without an operation id, so nothing else
    // keeps the partition alive, then run the cleanup its alarm would run.
    await expect(
      stub.run([
        {
          op: 'kv.set',
          k: await hashGuardValue(PEPPER, 'k:offline', key),
          v: 'passed',
          ttlMs: 1000,
          mode: 'always',
        },
      ])
    ).resolves.toMatchObject({ ok: true });
    await new Promise((settle) => setTimeout(settle, 1200));
    await stub.runCleanup();
    // The still-warm instance must keep its schema and serve the partition.
    await expect(client.get(key)).resolves.toBeNull();
    expect(await client.set(key, 'again', { ttlMs: 60_000 })).toBe(true);
    await expect(client.get(key)).resolves.toBe('again');
  });

  it('accepts the previous secret during rotation', async () => {
    const previous = httpClient(mf, 'replay', 'old-secret-'.padEnd(48, 'o'));
    await expect(previous.get('rotation-probe')).resolves.toBeNull();
  });

  it('admits exactly one of many concurrent NX claims', async () => {
    const client = httpClient(mf, 'replay');
    const claims = await Promise.all(
      Array.from({ length: 50 }, () =>
        client.set('refresh:user:jti-race', '1', { ttlMs: 60_000, mode: 'nx' })
      )
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('expires clearance at its TTL', async () => {
    const client = httpClient(mf, 'offline');
    expect(
      await client.set('offline:clearance:s1', 'passed', { ttlMs: 1000 })
    ).toBe(true);
    expect(await client.get('offline:clearance:s1')).toBe('passed');
    await new Promise((settle) => setTimeout(settle, 1200));
    expect(await client.get('offline:clearance:s1')).toBeNull();
    expect(await client.ttl('offline:clearance:s1')).toBe(-2);
  });

  it('stops at the first denied subject without charging later ones', async () => {
    const client = httpClient(mf, 'offline');
    const subjects = [
      {
        partition: 'ip:198.51.100.7',
        windows: [
          { key: '1m', limit: 1, windowMs: 60_000, algo: 'sliding' as const },
        ],
      },
      {
        partition: 'session:sequential',
        windows: [
          { key: '1m', limit: 1, windowMs: 60_000, algo: 'sliding' as const },
        ],
      },
    ];
    // The first call charges both subjects; reset the session by using a new one.
    expect((await client.hitWindows(subjects)).ok).toBe(true);
    const fresh = [
      subjects[0]!,
      { ...subjects[1]!, partition: 'session:uncharged' },
    ];
    await expect(client.hitWindows(fresh)).resolves.toMatchObject({
      ok: false,
      subjectIndex: 0,
    });
    // The skipped session step was not charged and still has its unit.
    await expect(client.hitWindows([fresh[1]!])).resolves.toMatchObject({
      ok: true,
    });
  });

  it('serves native Workers through the service binding', async () => {
    const client = await bindingClient(mf);
    const reserve = (receipt: string) =>
      client.reserve({
        partition: 'pwd:meet-guest',
        budgets: [
          { key: 'source', limit: 300, ttlMs: 900_000 },
          { key: 'target', limit: 1, ttlMs: 900_000 },
        ],
        receipt,
      });
    await expect(reserve('r1')).resolves.toMatchObject({ ok: true });
    await expect(reserve('r2')).resolves.toMatchObject({ ok: false });
    await expect(
      client.refund({
        partition: 'pwd:meet-guest',
        receipt: 'r1',
        target: 'target',
      })
    ).resolves.toBe(0);
    await expect(reserve('r3')).resolves.toMatchObject({ ok: true });
  });

  it('fails closed while the operator stop fence is set', async () => {
    const client = httpClient(mf, 'offline');
    expect((await control(mf, 'stop', 'POST')).body).toMatchObject({
      stopped: true,
    });
    const usedBy = async () =>
      JSON.stringify((await control(mf, 'state')).body.families);
    const before = await usedBy();
    await expect(client.get('offline:clearance:s2')).rejects.toMatchObject({
      code: 'guard_stopped',
    });
    await expect((await bindingClient(mf)).get('k')).rejects.toMatchObject({
      code: 'guard_stopped',
    });
    // Stopped requests are neither executed nor billed.
    expect(await usedBy()).toBe(before);

    expect((await control(mf, 'resume', 'POST')).body).toMatchObject({
      stopped: false,
    });
    await expect(client.get('offline:clearance:s2')).resolves.toBeNull();
  });
});

describe('secret configuration', () => {
  it('serves nothing when the operator token reuses a signing secret', async () => {
    const mf = createRuntime({ operator: SECRET });
    await expect(httpClient(mf, 'replay').get('k')).rejects.toMatchObject({
      code: 'guard_unavailable',
    });
    await mf.dispose();
  });

  it('serves nothing when any accepted secret is short', async () => {
    const mf = createRuntime({ secrets: `${SECRET},short` });
    await expect(httpClient(mf, 'replay').get('k')).rejects.toMatchObject({
      code: 'guard_unavailable',
    });
    await mf.dispose();
  });
});

describe('budget configuration', () => {
  it('serves nothing when the family budgets are invalid', async () => {
    const mf = createRuntime({ familyBudgets: 'offline=99999999' });
    await expect(httpClient(mf, 'replay').get('k')).rejects.toMatchObject({
      code: 'guard_unavailable',
    });
    await mf.dispose();
  });
});

describe('daily operation budget', () => {
  it('persists a budget stop across restarts until an operator resumes', async () => {
    const persist = join(workDir, 'budget-state');
    const first = createRuntime({ familyBudgets: 'replay=5', persist });
    const client = httpClient(first, 'replay');
    for (let index = 0; index < 5; index += 1) {
      await expect(client.get(`budget:${index}`)).resolves.toBeNull();
    }
    await expect(client.get('budget:over')).rejects.toMatchObject({
      code: 'guard_stopped',
    });
    expect((await control(first, 'state')).body).toMatchObject({
      stopped: false,
      families: { replay: { stopped: true, used: 5, budget: 5 } },
    });
    await first.dispose();

    const second = createRuntime({ familyBudgets: 'replay=5', persist });
    await expect(
      httpClient(second, 'replay').get('budget:after')
    ).rejects.toMatchObject({ code: 'guard_stopped' });
    expect((await control(second, 'resume', 'POST')).body).toMatchObject({
      stopped: false,
      families: { replay: { stopped: false, used: 0 } },
    });
    await expect(
      httpClient(second, 'replay').get('budget:resumed')
    ).resolves.toBeNull();
    await second.dispose();
  });

  it('keeps other families serving when one exhausts its budget', async () => {
    const mf = createRuntime({ familyBudgets: 'offline=3' });
    const offline = httpClient(mf, 'offline');
    for (let index = 0; index < 3; index += 1) {
      await expect(offline.get(`flood:${index}`)).resolves.toBeNull();
    }
    await expect(offline.get('flood:over')).rejects.toMatchObject({
      code: 'guard_stopped',
    });
    await expect(httpClient(mf, 'replay').get('fence')).resolves.toBeNull();
    await expect((await bindingClient(mf)).get('login')).resolves.toBeNull();
    await mf.dispose();
  });
});
