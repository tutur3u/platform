import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createAbuseGuardClient,
  createBindingGuardTransport,
  createHttpGuardTransport,
} from '@tuturuuu/utils/abuse-guard/client';
import { hashGuardValue } from '@tuturuuu/utils/abuse-guard/crypto';
import type {
  AbuseGuardFamily,
  GuardRpc,
} from '@tuturuuu/utils/abuse-guard/protocol';
import { createPasswordAttemptLimiter } from '@tuturuuu/utils/abuse-protection/password-attempt-limits';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const SECRET = 'fairness-test-secret'.padEnd(48, 's');
const PEPPER = 'fairness-test-pepper'.padEnd(48, 'p');
const OPERATOR = 'fairness-test-operator'.padEnd(48, 'o');
let dir: string;
let scriptPath: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'abuse-fairness-'));
  scriptPath = join(dir, 'worker.mjs');
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
  await rm(dir, { recursive: true, force: true });
});

function runtime(persist?: string) {
  const bindings = {
    ABUSE_GUARD_SECRETS: SECRET,
    ABUSE_GUARD_OPERATOR_TOKEN: OPERATOR,
    ABUSE_GUARD_DAILY_OP_BUDGET: '10000',
    ABUSE_GUARD_FAMILY_BUDGETS:
      'offline=1000,proxy=1000,replay=1000,password=1000',
  };
  return new Miniflare({
    durableObjectsPersist: persist ?? false,
    workers: [
      {
        name: 'guard',
        modules: true,
        scriptPath,
        modulesRoot: dir,
        compatibilityDate: '2026-07-01',
        bindings,
        durableObjects: {
          GUARD_SUBJECT: { className: 'GuardSubject', useSQLite: true },
          GUARD_CONTROL: { className: 'GuardControl', useSQLite: true },
        },
      },
      {
        name: 'replica',
        modules: true,
        scriptPath,
        modulesRoot: dir,
        compatibilityDate: '2026-07-01',
        bindings,
        durableObjects: {
          GUARD_SUBJECT: { className: 'GuardSubject', scriptName: 'guard' },
          GUARD_CONTROL: { className: 'GuardControl', scriptName: 'guard' },
        },
      },
      {
        name: 'caller',
        modules: true,
        compatibilityDate: '2026-07-01',
        script: `export default { async fetch(request, env) { return Response.json(await env.GUARD.run(await request.json())); } };`,
        serviceBindings: {
          GUARD: { name: 'replica', entrypoint: 'AbuseGuardEntrypoint' },
        },
      },
    ],
  });
}

async function boundRun(mf: Miniflare, rpc: GuardRpc) {
  const caller = await mf.getWorker('caller');
  return (
    await caller.fetch('http://caller/', {
      method: 'POST',
      body: JSON.stringify(rpc),
    })
  ).json();
}

function client(
  mf: Miniflare,
  family: AbuseGuardFamily,
  source: string,
  principal?: string,
  replica = false
) {
  const transport = replica
    ? createBindingGuardTransport(
        {
          run: async (rpc) => boundRun(mf, rpc),
        },
        10000
      )
    : createHttpGuardTransport({
        url: 'http://localhost',
        secret: SECRET,
        timeoutMs: 10000,
        fetch: async (url, init) => {
          const response = await mf.dispatchFetch(String(url), init as never);
          return new Response(await response.arrayBuffer(), {
            status: response.status,
            headers: Object.fromEntries(response.headers),
          });
        },
      });
  return createAbuseGuardClient({
    family,
    pepper: PEPPER,
    transport,
    fairness: { source, ...(principal ? { principal } : {}) },
  });
}

async function usage(mf: Miniflare, family: string) {
  const response = await mf.dispatchFetch('http://localhost/control/state', {
    headers: { authorization: `Bearer ${OPERATOR}` },
  });
  const state = (await response.json()) as {
    families: Record<string, { used: number; stopped: boolean }>;
  };
  return state.families[family];
}

describe('fairness through the real Worker and SQLite Durable Objects', () => {
  it.each(['replay', 'password'] as const)(
    'limits one principal across instances, sources and scope partitions for %s',
    async (family) => {
      const mf = runtime();
      try {
        const outcomes = await Promise.all(
          Array.from({ length: 80 }, async (_, n) => {
            try {
              await client(
                mf,
                family,
                `rotating-source:${n}`,
                'one-principal',
                n % 2 === 0
              ).set(`scope:${n}`, '1', { ttlMs: 60000 });
              return 'allowed';
            } catch (error) {
              expect(error).toMatchObject({ code: 'guard_limited' });
              return 'denied';
            }
          })
        );
        expect(
          outcomes.filter((outcome) => outcome === 'allowed')
        ).toHaveLength(50);
        expect(await usage(mf, family)).toMatchObject({
          used: 50,
          stopped: false,
        });
        await expect(
          client(mf, family, 'legit-source', 'legit-principal', true).get(
            'legit'
          )
        ).resolves.toBeNull();
        expect(await usage(mf, family)).toMatchObject({
          used: 51,
          stopped: false,
        });
      } finally {
        await mf.dispose();
      }
    }
  );

  it.each(['replay', 'password'] as const)(
    'limits one source while principals rotate for %s',
    async (family) => {
      const mf = runtime();
      try {
        const results = await Promise.allSettled(
          Array.from({ length: 80 }, (_, n) =>
            client(mf, family, 'one-source', `principal:${n}`, n % 2 === 0).get(
              `token:${n}`
            )
          )
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
          50
        );
        for (const r of results)
          if (r.status === 'rejected')
            expect(r.reason).toMatchObject({ code: 'guard_limited' });
        expect(await usage(mf, family)).toMatchObject({
          used: 50,
          stopped: false,
        });
        await expect(
          client(mf, family, 'other-source', 'other-principal').get('legit')
        ).resolves.toBeNull();
      } finally {
        await mf.dispose();
      }
    }
  );

  it.each(['offline', 'proxy'] as const)(
    'reuses fairness for an opted-in %s window caller',
    async (family) => {
      const mf = runtime();
      const subjects = [
        {
          partition: 'window',
          windows: [
            { key: '1m', limit: 1000, windowMs: 60000, algo: 'fixed' as const },
          ],
        },
      ];
      try {
        const guarded = client(mf, family, 'source', 'principal');
        for (let n = 0; n < 50; n++)
          expect((await guarded.hitWindows(subjects)).ok).toBe(true);
        await expect(guarded.hitWindows(subjects)).rejects.toMatchObject({
          code: 'guard_limited',
        });
        expect(
          (
            await client(
              mf,
              family,
              'other-source',
              'other-principal'
            ).hitWindows(subjects)
          ).ok
        ).toBe(true);
        expect(await usage(mf, family)).toMatchObject({
          used: 51,
          stopped: false,
        });
      } finally {
        await mf.dispose();
      }
    }
  );

  it('leaves a source spare capacity usable after rejecting an oversized batch', async () => {
    const mf = runtime();
    try {
      const original = client(mf, 'replay', 'source', 'principal');
      for (let n = 0; n < 49; n++) await original.get(`token:${n}`);
      await expect(original.mget(['batch-a', 'batch-b'])).rejects.toMatchObject(
        { code: 'guard_limited' }
      );
      await expect(
        client(mf, 'replay', 'source', 'legit-principal').get('legit')
      ).resolves.toBeNull();
      expect(await usage(mf, 'replay')).toMatchObject({
        used: 50,
        stopped: false,
      });
    } finally {
      await mf.dispose();
    }
  });

  it('bounds denied password reserves across caller restarts and target rotation', async () => {
    const mf = runtime();
    const subject = {
      scope: 'meet-guest' as const,
      ip: '203.0.113.4',
      target: 'target',
    };
    const limiter = (replica: boolean) =>
      createPasswordAttemptLimiter(
        async () => null,
        () => ({
          kind: 'durable-object',
          client: client(mf, 'password', 'unused', undefined, replica),
        })
      );
    try {
      const live = limiter(false);
      for (let n = 0; n < 10; n++)
        expect((await live.check(subject)).allowed).toBe(true);
      for (let n = 0; n < 100; n++)
        expect((await live.check(subject)).allowed).toBe(false);
      // Ten admitted reserves plus one denied probe; cached repeats spend zero.
      expect(await usage(mf, 'password')).toMatchObject({
        used: 11,
        stopped: false,
      });
      for (let n = 0; n < 80; n++) {
        const restarted = limiter(n % 2 === 0);
        await restarted.check({ ...subject, target: `rotated:${n}` });
      }
      expect(await usage(mf, 'password')).toMatchObject({
        used: 50,
        stopped: false,
      });
      expect(
        (await live.check({ ...subject, ip: '203.0.113.5', target: 'legit' }))
          .allowed
      ).toBe(true);
    } finally {
      await mf.dispose();
    }
  });

  it('counts legitimate success refunds against the same principal/source allowance', async () => {
    const mf = runtime();
    const limiter = createPasswordAttemptLimiter(
      async () => null,
      () => ({
        kind: 'durable-object',
        client: client(mf, 'password', 'unused'),
      })
    );
    const subject = {
      scope: 'nova-challenge' as const,
      target: 'challenge:user',
      userId: 'user',
      ip: '203.0.113.9',
    };
    try {
      for (let n = 0; n < 25; n++) {
        const result = await limiter.check(subject);
        expect(result.allowed).toBe(true);
        await result.refund?.();
      }
      expect(await usage(mf, 'password')).toMatchObject({
        used: 50,
        stopped: false,
      });
      expect(
        (await limiter.check({ ...subject, ip: '203.0.113.10' })).allowed
      ).toBe(false);
      expect(await usage(mf, 'password')).toMatchObject({
        used: 50,
        stopped: false,
      });
      expect(
        (
          await limiter.check({
            ...subject,
            target: 'legit',
            userId: 'legit',
            ip: '203.0.113.11',
          })
        ).allowed
      ).toBe(true);
    } finally {
      await mf.dispose();
    }
  });

  it('preserves source/principal usage and the stop fence across a real runtime restart', async () => {
    const persist = join(dir, 'restart-state');
    const first = runtime(persist);
    for (let n = 0; n < 50; n++)
      await client(first, 'replay', 'source', 'principal').get(`token:${n}`);
    await first.dispose();
    const second = runtime(persist);
    try {
      await expect(
        client(second, 'replay', 'new-source', 'principal', true).get('fresh')
      ).rejects.toMatchObject({ code: 'guard_limited' });
      await expect(
        client(second, 'replay', 'source', 'new-principal').get('fresh')
      ).rejects.toMatchObject({ code: 'guard_limited' });
      expect(await usage(second, 'replay')).toMatchObject({
        used: 50,
        stopped: false,
      });
      await second.dispatchFetch('http://localhost/control/stop', {
        method: 'POST',
        headers: { authorization: `Bearer ${OPERATOR}` },
      });
      await expect(
        client(second, 'replay', 'legit', 'legit').get('fresh')
      ).rejects.toMatchObject({ code: 'guard_stopped' });
      await second.dispatchFetch('http://localhost/control/resume', {
        method: 'POST',
        headers: { authorization: `Bearer ${OPERATOR}` },
      });
      await expect(
        client(second, 'replay', 'legit', 'legit').get('fresh')
      ).resolves.toBeNull();
      // Resume resets family spend, never the attacker's daily fairness counter.
      await expect(
        client(second, 'replay', 'source2', 'principal').get('fresh')
      ).rejects.toMatchObject({ code: 'guard_limited' });
    } finally {
      await second.dispose();
    }
  });

  it('rejects missing fairness rather than exposing an unmetered protected-family path', async () => {
    const mf = runtime();
    try {
      const p = await hashGuardValue(PEPPER, 'p:replay', 'key');
      const k = await hashGuardValue(PEPPER, 'k:replay', 'key');
      for (const family of ['replay', 'password'] as const) {
        const rpc: GuardRpc = {
          v: 1,
          id: crypto.randomUUID(),
          family,
          steps: [{ p, cmds: [{ op: 'kv.get', k }] }],
        };
        expect(await boundRun(mf, rpc)).toEqual({ error: 'bad_request' });
        expect(await usage(mf, family)).toBeUndefined();
      }
    } finally {
      await mf.dispose();
    }
  });
});
