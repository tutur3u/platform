import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertLatestRecord,
  type CanonicalValue,
  decodeCanonical,
  encodeCanonical,
  generateSigningKeyPair,
  keyringHeadHash,
  randomBytes,
  signKeyringHead,
  signWitnessConfirmation,
  toHex,
  verifyAttestation,
  type WitnessHeadView,
} from '@tuturuuu/vault-crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import {
  DEPLOYMENT,
  descriptor,
  LogBuilder,
  makeGenesis,
  party,
  record,
} from './test-support';

const TOKEN = 'witness-test-token-'.padEnd(48, 'x');
let workDir: string;
let scriptPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vault-witness-test-'));
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

const b64url = (b: Uint8Array) =>
  Buffer.from(b)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

function witnessKey(generation: number) {
  const pair = generateSigningKeyPair();
  return {
    generation,
    pair,
    secret: `${generation}:${b64url(pair.secretKey)}`,
  };
}

function runtime(
  key: string,
  options: { persist?: string; stopped?: boolean } = {}
) {
  return new Miniflare({
    durableObjectsPersist: options.persist ?? false,
    modules: true,
    scriptPath,
    modulesRoot: workDir,
    // The newest date the pinned local workerd supports; the deployed
    // Worker's date is in cloudflare.config.ts.
    compatibilityDate: '2026-07-01',
    durableObjects: {
      VAULT_WITNESS: { className: 'VaultWitness', useSQLite: true },
      KEYRING_WITNESS: { className: 'KeyringWitness', useSQLite: true },
    },
    bindings: {
      WITNESS_DEPLOYMENT: DEPLOYMENT,
      WITNESS_SIGNING_KEY: key,
      WITNESS_API_TOKEN: TOKEN,
      WITNESS_STOPPED: options.stopped ? 'true' : 'false',
    },
  });
}

async function call(
  mf: Miniflare,
  path: string,
  body: CanonicalValue,
  init: { token?: string; type?: string; raw?: Uint8Array } = {}
) {
  const res = await mf.dispatchFetch(`http://witness.test${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${init.token ?? TOKEN}`,
      'content-type': init.type ?? 'application/cbor',
    },
    body: init.raw ?? encodeCanonical(body),
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    status: res.status,
    body: decodeCanonical(bytes) as Record<string, never>,
  };
}

async function seeded(mf: Miniflare) {
  const owner = party('owner');
  const log = new LogBuilder(makeGenesis([owner]));
  const path = `/v1/vaults/${toHex(log.vaultId)}`;
  expect(
    (await call(mf, `${path}/init`, { genesis: log.genesis as never })).status
  ).toBe(200);
  const append = async (entry: unknown, records: unknown[], generation = 1) => {
    const c = await call(mf, `${path}/challenge`, {});
    const base = {
      witness_generation: generation,
      seq: log.entries.length,
      key_log_head: log.head,
    };
    return call(mf, `${path}/append`, {
      challenge: c.body.challenge,
      base,
      entry: entry as never,
      records: records as never,
    });
  };
  const epoch = log.next(
    { kind: 'epoch', descriptor: await descriptor('prod', 1) },
    [owner]
  );
  expect((await append(epoch, [])).status).toBe(200);
  log.commit(epoch);
  const v1 = record(log.vaultId, owner);
  expect((await append(null, [v1])).body).toMatchObject({
    ok: true,
    revision: 2,
  });
  return { owner, log, path, v1, append };
}

describe('vault witness Worker', () => {
  it('serves health with the active generation and public key', async () => {
    const key = witnessKey(4);
    const mf = runtime(key.secret);
    try {
      const res = await mf.dispatchFetch('http://witness.test/v1/health');
      expect(await res.json()).toEqual({
        ok: true,
        stopped: false,
        generation: 4,
        public_key: toHex(key.pair.publicKey),
      });
    } finally {
      await mf.dispose();
    }
  });

  it('commits and attests over HTTP, verifiable by a client', async () => {
    const key = witnessKey(1);
    const mf = runtime(key.secret);
    try {
      const { log, path, v1 } = await seeded(mf);
      const nonce = randomBytes(16);
      const out = await call(mf, `${path}/attest`, {
        nonce,
        proofs: { env: 'prod', variable_ids: ['var-1'] },
      });
      expect(out.status).toBe(200);
      const a = verifyAttestation(out.body.attestation, {
        scope: { deployment: DEPLOYMENT, vault_id: log.vaultId },
        witnessKeys: new Map([[1, key.pair.publicKey]]),
        minGeneration: 1,
        now: Math.floor(Date.now() / 1000),
        floorSeq: 1,
        floorRevision: 2,
        expectedNonce: nonce,
      });
      expect(() =>
        assertLatestRecord(a, v1, (out.body.proofs as never[])[0] as never)
      ).not.toThrow();
    } finally {
      await mf.dispose();
    }
  });

  it('refuses bad tokens, media types, oversized and non-canonical bodies, and unknown routes', async () => {
    const mf = runtime(witnessKey(1).secret);
    try {
      const path = `/v1/vaults/${'ab'.repeat(32)}/attest`;
      const body = { nonce: null, proofs: null };
      expect((await call(mf, path, body, { token: 'wrong' })).status).toBe(401);
      expect(
        (await call(mf, path, body, { type: 'application/json' })).status
      ).toBe(415);
      expect(
        (await call(mf, path, body, { raw: new Uint8Array(300 * 1024) })).status
      ).toBe(413);
      // An indefinite-length map is valid CBOR but not canonical.
      expect(
        (await call(mf, path, body, { raw: Uint8Array.of(0xbf, 0xff) })).status
      ).toBe(400);
      expect((await call(mf, path, body)).status).toBe(404);
      expect(
        (await call(mf, `/v1/vaults/${'ab'.repeat(31)}/attest`, body)).status
      ).toBe(404);
      expect(
        (await call(mf, `/v1/vaults/${'ab'.repeat(32)}/nope`, {})).status
      ).toBe(404);
    } finally {
      await mf.dispose();
    }
  });

  it('fails every call closed while the stop fence is set', async () => {
    const mf = runtime(witnessKey(1).secret, { stopped: true });
    try {
      const out = await call(mf, `/v1/vaults/${'ab'.repeat(32)}/challenge`, {});
      expect(out).toEqual({
        status: 503,
        body: { ok: false, error: 'stopped' },
      });
      const health = await (
        await mf.dispatchFetch('http://witness.test/v1/health')
      ).json();
      expect(health).toMatchObject({ ok: false, stopped: true });
    } finally {
      await mf.dispose();
    }
  });

  it('keeps state across a restart and re-attests after a key rotation', async () => {
    const persist = await mkdtemp(join(tmpdir(), 'vault-witness-state-'));
    const k1 = witnessKey(1);
    try {
      let mf = runtime(k1.secret, { persist });
      const { owner, path } = await seeded(mf);
      await mf.dispose();

      mf = runtime(k1.secret, { persist });
      const again = await call(mf, `${path}/attest`, {
        nonce: null,
        proofs: null,
      });
      expect(again.body.attestation).toMatchObject({
        attestation: { revision: 2, seq: 1 },
      });
      await mf.dispose();

      const k2 = witnessKey(2);
      mf = runtime(k2.secret, { persist });
      const blocked = await call(mf, `${path}/attest`, {
        nonce: null,
        proofs: null,
      });
      expect(blocked.status).toBe(409);
      const view = blocked.body.view as unknown as WitnessHeadView;
      expect(view).toMatchObject({ witness_generation: 2, revision: 2 });
      const confirmation = signWitnessConfirmation(
        owner.pair.secretKey,
        owner.signing_key,
        view
      );
      expect(
        (
          await call(mf, `${path}/confirm`, {
            confirmation: confirmation as never,
          })
        ).status
      ).toBe(200);
      const after = await call(mf, `${path}/attest`, {
        nonce: null,
        proofs: null,
      });
      expect(after.body.attestation).toMatchObject({
        attestation: { witness_generation: 2 },
      });
      await mf.dispose();

      mf = runtime(k1.secret, { persist });
      expect(
        (await call(mf, `${path}/attest`, { nonce: null, proofs: null })).status
      ).toBe(503);
      await mf.dispose();
    } finally {
      await rm(persist, { recursive: true, force: true });
    }
  });

  it('chains and attests keyring heads', async () => {
    const mf = runtime(witnessKey(1).secret);
    try {
      const id = randomBytes(16);
      const identity = generateSigningKeyPair();
      const head = (prev: ReturnType<typeof signKeyringHead> | null) =>
        signKeyringHead(identity.secretKey, {
          deployment: DEPLOYMENT,
          vault_user_id: id,
          counter: prev ? prev.head.counter + 1 : 0,
          prev_hash: prev ? keyringHeadHash(prev) : null,
          keyring_hash: randomBytes(32),
          signing_key: identity.publicKey,
          next_signing_key: null,
          issued_at: 1000,
        });
      const path = `/v1/keyrings/${toHex(id)}`;
      const h0 = head(null);
      expect(
        (await call(mf, `${path}/put`, { head: h0 as never })).status
      ).toBe(200);
      const h1 = head(h0);
      expect(
        (await call(mf, `${path}/put`, { head: h1 as never })).status
      ).toBe(200);
      expect(
        (await call(mf, `${path}/put`, { head: h0 as never })).status
      ).toBe(422);
      const out = await call(mf, `${path}/attest`, { nonce: null });
      expect(out.body).toMatchObject({
        ok: true,
        attestation: { attestation: { counter: 1 } },
      });
    } finally {
      await mf.dispose();
    }
  });
});
