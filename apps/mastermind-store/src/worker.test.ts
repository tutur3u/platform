import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createMastermindStoreClient,
  type MastermindStore,
  MastermindStoreUnavailableError,
} from '@tuturuuu/utils/mastermind-store/client';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const TOKEN = 'service-token-'.padEnd(48, 's');
const NEXT = 'service-next-'.padEnd(48, 'n');
const OPERATOR = 'operator-token-'.padEnd(48, 'o');
const ORIGIN = 'http://localhost';

let workDir: string;
let scriptPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mastermind-store-test-'));
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

function runtime(
  options: { persist?: string; budget?: string; tokens?: string } = {}
) {
  return new Miniflare({
    durableObjectsPersist: options.persist ?? false,
    modules: true,
    scriptPath,
    modulesRoot: workDir,
    compatibilityDate: '2026-07-01',
    durableObjects: {
      MASTERMIND_STORE: { className: 'MastermindStore', useSQLite: true },
      MASTERMIND_BRIDGE: { className: 'FleetBridge', useSQLite: true },
    },
    bindings: {
      MASTERMIND_STORE_TOKENS: options.tokens ?? `${TOKEN},${NEXT}`,
      MASTERMIND_STORE_OPERATOR_TOKEN: OPERATOR,
      MASTERMIND_STORE_DAILY_WRITE_BUDGET: options.budget ?? '1000',
    },
  });
}

function client(mf: Miniflare, token = TOKEN): MastermindStore {
  return createMastermindStoreClient({
    url: ORIGIN,
    token,
    timeoutMs: 10_000,
    fetch: ((url: string, init: RequestInit) =>
      mf.dispatchFetch(url, init as never)) as never,
  });
}

async function operator(mf: Miniflare, path: string, body?: unknown) {
  const response = await mf.dispatchFetch(`${ORIGIN}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${OPERATOR}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as never };
}

const ttlMs = 60_000;

describe('mastermind store Worker', () => {
  it('serves the atomic ops through the shared client', async () => {
    const mf = runtime();
    try {
      const store = client(mf);
      expect(await store.set('fleet:state', '{"a":1}', { ttlMs })).toBe(true);
      expect(await store.get('fleet:state')).toBe('{"a":1}');
      expect(await store.set('nonce:x', '1', { ttlMs, nx: true })).toBe(true);
      expect(await store.set('nonce:x', '1', { ttlMs, nx: true })).toBe(false);
      expect(await store.compareAndSet('answer:a', null, 'r1', ttlMs)).toBe(
        true
      );
      expect(await store.compareAndSet('answer:a', null, 'r2', ttlMs)).toBe(
        false
      );
      expect(await store.compareAndDelete('answer:a', 'r1')).toBe(true);
      expect(await store.mget(['fleet:state', 'answer:a'])).toEqual([
        '{"a":1}',
        null,
      ]);
      // The rotation slot is accepted too.
      expect(await client(mf, NEXT).get('fleet:state')).toBe('{"a":1}');
    } finally {
      await mf.dispose();
    }
  });

  it('refuses a missing or wrong token and an unconfigured Worker', async () => {
    const mf = runtime();
    try {
      await expect(client(mf, 'x'.repeat(48)).get('k')).rejects.toMatchObject({
        code: 'unauthorized',
      });
      const raw = await mf.dispatchFetch(`${ORIGIN}/v1/ops`, {
        method: 'POST',
        body: '{}',
      });
      expect(raw.status).toBe(401);
      // The operator token is not a service token.
      await expect(client(mf, OPERATOR).get('k')).rejects.toBeInstanceOf(
        MastermindStoreUnavailableError
      );
    } finally {
      await mf.dispose();
    }
    const weak = runtime({ tokens: 'short' });
    try {
      await expect(client(weak).get('k')).rejects.toMatchObject({
        code: 'unavailable',
      });
    } finally {
      await weak.dispose();
    }
  });

  it('rejects oversized bodies, bad ops and unknown routes', async () => {
    const mf = runtime();
    try {
      const huge = 'x'.repeat(301 * 1024);
      await expect(
        client(mf).set('big', huge, { ttlMs })
      ).rejects.toMatchObject({ code: 'bad_request' });
      await expect(client(mf).get('bad key!')).rejects.toMatchObject({
        code: 'bad_request',
      });
      const unknown = await mf.dispatchFetch(`${ORIGIN}/v1/other`);
      expect(unknown.status).toBe(404);
    } finally {
      await mf.dispose();
    }
  });

  it('stops at the daily write budget', async () => {
    const mf = runtime({ budget: '2' });
    try {
      const store = client(mf);
      await store.set('a', '1', { ttlMs });
      await store.set('b', '2', { ttlMs });
      await expect(store.set('c', '3', { ttlMs })).rejects.toMatchObject({
        code: 'budget',
      });
      expect(await store.get('a')).toBe('1');
      const status = await operator(mf, '/v1/status');
      expect(status.body).toMatchObject({
        ok: true,
        status: { writes: 2, budget: 2, rows: 2, stopped: false },
      });
    } finally {
      await mf.dispose();
    }
  });

  it('keeps the stop fence across restarts until the operator clears it', async () => {
    const persist = await mkdtemp(join(tmpdir(), 'mastermind-store-fence-'));
    try {
      const first = runtime({ persist });
      try {
        await client(first).set('a', '1', { ttlMs });
        expect(
          (await operator(first, '/v1/fence', { stopped: true })).body
        ).toEqual({
          ok: true,
          stopped: true,
        });
        await expect(client(first).get('a')).rejects.toMatchObject({
          code: 'stopped',
        });
      } finally {
        await first.dispose();
      }
      const second = runtime({ persist });
      try {
        await expect(client(second).get('a')).rejects.toMatchObject({
          code: 'stopped',
        });
        // Service tokens cannot lift the fence.
        const denied = await second.dispatchFetch(`${ORIGIN}/v1/fence`, {
          method: 'POST',
          headers: { authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ stopped: false }),
        });
        expect(denied.status).toBe(401);
        await operator(second, '/v1/fence', { stopped: false });
        expect(await client(second).get('a')).toBe('1');
      } finally {
        await second.dispose();
      }
    } finally {
      await rm(persist, { recursive: true, force: true });
    }
  });

  it('answers a cached get without reaching the Durable Object again', async () => {
    const mf = runtime({ budget: '1000' });
    try {
      const store = client(mf);
      await store.set('fleet:state', 'v1', { ttlMs });
      expect(await store.get('fleet:state', { cacheMs: 5000 })).toBe('v1');
      await store.set('fleet:state', 'v2', { ttlMs });
      // The polled read may lag a write by at most the cache window.
      expect(await store.get('fleet:state', { cacheMs: 5000 })).toBe('v1');
      // Uncached reads are always current.
      expect(await store.get('fleet:state')).toBe('v2');
    } finally {
      await mf.dispose();
    }
  });
});
