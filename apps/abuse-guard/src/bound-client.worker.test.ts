/**
 * The client side of the `ABUSE_GUARD` service binding in workerd (Miniflare):
 * an app Worker bound to the real `AbuseGuardEntrypoint` configures the shared
 * runtime before routing on every request, as every native app does. No
 * Cloudflare network or account is used.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

const SECRET = 'bound-test-secret-'.padEnd(48, 'x');
const PEPPER = 'bound-test-pepper-'.padEnd(48, 'z');
const APP = 'http://app.localhost';

let workDir: string;
let mf: Miniflare | undefined;

const bundle = (entry: string, outfile: string) =>
  build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'import'],
    external: ['cloudflare:*', 'node:*'],
    logLevel: 'silent',
  });

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'abuse-guard-bound-test-'));
  await bundle(
    resolve(import.meta.dirname, 'worker.ts'),
    join(workDir, 'guard.mjs')
  );
  await bundle(
    resolve(import.meta.dirname, 'test-fixtures/bound-client-worker.ts'),
    join(workDir, 'app.mjs')
  );
});

afterEach(async () => {
  await mf?.dispose();
  mf = undefined;
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function start(appBindings: Record<string, string>) {
  mf = new Miniflare({
    durableObjectsPersist: false,
    workers: [
      {
        name: 'app',
        modules: true,
        scriptPath: join(workDir, 'app.mjs'),
        modulesRoot: workDir,
        // Production uses 2026-10-12; the pinned Miniflare runtime supports
        // dates up to 2026-08-06, and no flag this path relies on differs.
        compatibilityDate: '2026-08-01',
        compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
        bindings: appBindings,
        serviceBindings: {
          ABUSE_GUARD: {
            name: 'tuturuuu-abuse-guard',
            entrypoint: 'AbuseGuardEntrypoint',
          },
        },
      },
      {
        name: 'tuturuuu-abuse-guard',
        modules: true,
        scriptPath: join(workDir, 'guard.mjs'),
        modulesRoot: workDir,
        compatibilityDate: '2026-08-01',
        durableObjects: {
          GUARD_SUBJECT: { className: 'GuardSubject', useSQLite: true },
          GUARD_CONTROL: { className: 'GuardControl', useSQLite: true },
        },
        bindings: {
          ABUSE_GUARD_SECRETS: SECRET,
          ABUSE_GUARD_DAILY_OP_BUDGET: '100000',
          ABUSE_GUARD_FAMILY_BUDGETS: '',
        },
      },
    ],
  });
  await mf.ready;
  return mf;
}

async function call(runtime: Miniflare, query = '') {
  const response = await runtime.dispatchFetch(`${APP}/${query}`);
  return { status: response.status, body: (await response.json()) as any };
}

describe('ABUSE_GUARD service binding from an app Worker', () => {
  it('serves every request while no family is assigned (Finance production)', async () => {
    const runtime = await start({ ABUSE_GUARD_FAMILIES: '' });
    for (let index = 0; index < 3; index += 1) {
      expect(await call(runtime)).toEqual({
        status: 200,
        body: { kind: 'legacy' },
      });
    }
  });

  it('round-trips an assigned family through the bound entrypoint across requests', async () => {
    const runtime = await start({
      ABUSE_GUARD_FAMILIES: 'proxy',
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
    });
    for (const key of ['a', 'b']) {
      expect(await call(runtime, `?key=${key}`)).toEqual({
        status: 200,
        body: { kind: 'durable-object', set: true, value: 'v' },
      });
    }
  });

  it('keeps routing when configuration throws: assigned families turn off, never 500', async () => {
    const runtime = await start({
      ABUSE_GUARD_FAMILIES: 'proxy',
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
    });
    expect(await call(runtime, '?poison=1')).toEqual({
      status: 200,
      body: { kind: 'off' },
    });
    // A later healthy request reinstalls the binding.
    expect(await call(runtime, '?key=c')).toEqual({
      status: 200,
      body: { kind: 'durable-object', set: true, value: 'v' },
    });
  });

  it('never reads the configuration secrets while no family is assigned', async () => {
    const runtime = await start({ ABUSE_GUARD_FAMILIES: '' });
    expect(await call(runtime, '?poison=1')).toEqual({
      status: 200,
      body: { kind: 'legacy' },
    });
  });
});
