import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Fixture, fixture, serviceProvider } from '@tuturuuu/sso/testing';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { bundleWorker } from './__tests__/bundle';
import {
  keyMapText,
  permitKeyPair,
  randomKey,
  signedRequest,
  signInput,
} from './__tests__/harness';
import { PRODUCTION_DEFINES, RUNTIME_TEST_DEFINES } from './build-defines';
import { encodeBase64Url } from './key-set';
import { issuePermit } from './permit';

// The real Worker bundle in workerd: xml-crypto, @xmldom/xmldom and
// node:crypto X509Certificate under nodejs_compat, the SQLite Durable
// Objects and both named entry points through service bindings.
// Miniflare 4's workerd supports compatibility dates up to 2026-08-06; the
// deployed config's later date adds no flag this Worker depends on.
const COMPATIBILITY_DATE = '2026-08-01';
const CALLER = `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/__control') {
      const { method, args } = await request.json();
      return Response.json(await env.CONTROL[method](...args));
    }
    if (url.pathname === '/__default') {
      return env.DEFAULT.fetch('https://signer.internal/v1/saml/sign', { method: 'POST' });
    }
    return env.SIGNER.fetch(request);
  },
};`;

let workDir: string;
let testScript: string;
let productionScript: string;
let f: Fixture;
const requestKey = randomKey();
const controlKey = randomKey();
let permitKeys: Awaited<ReturnType<typeof permitKeyPair>>;
const runtimes: Miniflare[] = [];

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'sso-signer-runtime-'));
  await mkdir(join(workDir, 'test'));
  await mkdir(join(workDir, 'production'));
  testScript = await bundleWorker(join(workDir, 'test'), RUNTIME_TEST_DEFINES);
  productionScript = await bundleWorker(
    join(workDir, 'production'),
    PRODUCTION_DEFINES
  );
  f = fixture();
  permitKeys = await permitKeyPair();
}, 120_000);

afterAll(async () => {
  await Promise.all(runtimes.map((runtime) => runtime.dispose()));
  await rm(workDir, { recursive: true, force: true });
});

function runtime(scriptPath: string, dailyBudget: string) {
  const mf = new Miniflare({
    workers: [
      {
        name: 'caller',
        modules: true,
        script: CALLER,
        compatibilityDate: COMPATIBILITY_DATE,
        serviceBindings: {
          SIGNER: { name: 'signer', entrypoint: 'SignerEntry' },
          CONTROL: { name: 'signer', entrypoint: 'ControlEntry' },
          DEFAULT: 'signer',
        },
      },
      {
        name: 'signer',
        modules: true,
        scriptPath,
        modulesRoot: join(scriptPath, '..'),
        compatibilityDate: COMPATIBILITY_DATE,
        compatibilityFlags: ['nodejs_compat'],
        durableObjects: {
          SIGNER_CONTROL: { className: 'SignerControl', useSQLite: true },
          SIGNER_BUDGET: { className: 'SignerBudget', useSQLite: true },
          SIGNER_REPLAY: { className: 'SignerReplay', useSQLite: true },
        },
        bindings: {
          SSO_SIGNER_ENV: 'local',
          SSO_SIGNER_FENCE_FLOOR: '',
          SSO_SIGNER_DAILY_BUDGET: dailyBudget,
          SSO_SIGNER_KEYS: keyMapText(f),
          SSO_SIGNER_PERMIT_PUBLIC_KEY: permitKeys.publicKey,
          SSO_SIGNER_TRANSACTION_CHECK: 'unchecked-local',
          SSO_SIGNER_REQUEST_KEY: requestKey.text,
          SSO_SIGNER_CONTROL_KEY: controlKey.text,
          SSO_SIGNING_KEY_SAML_TEST_1: f.privateKey,
        },
      },
    ],
  });
  runtimes.push(mf);
  const control = async (method: string, ...args: unknown[]) =>
    (await (
      await mf.dispatchFetch('http://localhost/__control', {
        method: 'POST',
        body: JSON.stringify({ method, args }),
      })
    ).json()) as Record<string, unknown>;
  const dispatch = (request: Sent) =>
    mf.dispatchFetch('http://localhost/v1/saml/sign', {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
  return { mf, control, dispatch };
}

type Sent = Readonly<{ headers: Record<string, string>; body: string }>;

async function sign(input = signInput(f)) {
  const permit = await issuePermit({
    privateKey: permitKeys.privateKey,
    fields: input,
    id: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    nowMs: Date.now(),
  });
  const signed = await signedRequest({
    requestKey: requestKey.raw,
    body: { input, permit },
  });
  const request: Sent = {
    headers: Object.fromEntries(signed.headers),
    body: await signed.text(),
  };
  return { input, request };
}

describe('signer Worker in workerd (runtime test build)', () => {
  it('answers 404 on the default entry and refuses a wrong control key', async () => {
    const { mf, control } = runtime(testScript, '5');
    expect((await mf.dispatchFetch('http://localhost/__default')).status).toBe(
      404
    );
    expect(
      await control('setFence', randomKey().text, 'running', 'start')
    ).toEqual({ ok: false, error: 'unauthorized' });
    expect(await control('readFence', controlKey.text)).toMatchObject({
      ok: true,
      fence: { mode: 'stopped', version: 0 },
    });
  });

  it('builds and signs in workerd; Node-SAML accepts it; replays, budget and the fence refuse', async () => {
    const { control, dispatch } = runtime(testScript, '5');
    expect(
      await control('setFence', controlKey.text, 'running', 'runtime test')
    ).toMatchObject({ ok: true, fence: { mode: 'running', version: 1 } });

    const first = await sign();
    const signed = await dispatch(first.request);
    const result = (await signed.json()) as Record<string, string>;
    expect(signed.status, JSON.stringify(result)).toBe(200);
    const xml = Buffer.from(result.samlResponse ?? '', 'base64').toString();
    const profile = await (await serviceProvider(f)).accept(xml);
    expect(profile.nameID).toBe(f.identity.pairwiseSubject);
    expect(profile.attributes).toMatchObject({ email: f.identity.email });
    expect(result.expiresAt).toBe(first.input.notOnOrAfter);

    // Same nonce and permit: refused by the replay object (unit 2).
    expect((await dispatch(first.request)).status).toBe(409);
    // Two concurrent copies of one request: exactly one signs (units 3, 4).
    const twin = await sign();
    const statuses = (
      await Promise.all([dispatch(twin.request), dispatch(twin.request)])
    ).map((response) => response.status);
    expect(statuses.sort()).toEqual([200, 409]);
    expect((await dispatch((await sign()).request)).status).toBe(200);
    // Budget 5 is spent.
    expect((await dispatch((await sign()).request)).status).toBe(429);

    expect(
      await control('setFence', controlKey.text, 'stopped', 'runtime test stop')
    ).toMatchObject({ ok: true, fence: { mode: 'stopped', version: 2 } });
    const stopped = await dispatch((await sign()).request);
    expect(stopped.status).toBe(503);
    expect(await stopped.json()).toMatchObject({ error: 'stopped' });
  });
});

describe('signer Worker production build', () => {
  it('drops the unchecked confirmation and every test fixture', async () => {
    const production = await readFile(productionScript, 'utf8');
    const test = await readFile(testScript, 'utf8');
    expect(test).toContain('unchecked-local');
    for (const marker of [
      'unchecked-local',
      '__SSO_SIGNER_UNCHECKED__',
      'child_process',
      'node-saml',
      'Disposable SSO test',
      'openssl',
    ]) {
      expect(production, marker).not.toContain(marker);
    }
  });

  it('refuses to sign in workerd even with the unchecked bindings set', async () => {
    const { control, dispatch } = runtime(productionScript, '5');
    expect(
      await control('setFence', controlKey.text, 'running', 'production build')
    ).toMatchObject({ ok: true });
    const response = await dispatch((await sign()).request);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'confirmation_unavailable',
    });
  });
});
