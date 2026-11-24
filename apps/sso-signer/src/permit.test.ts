import { fixture } from '@tuturuuu/sso/testing';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import {
  AUDIENCE,
  permitKeyPair,
  randomToken,
  signInput,
} from './__tests__/harness';
import type { SignInput } from './input';
import { parseKeySet } from './key-set';
import { canonicalJson, issuePermit, verifyPermit } from './permit';

const NOW = Date.now();
let input: SignInput;
let keys: Awaited<ReturnType<typeof permitKeyPair>>;

beforeAll(async () => {
  input = signInput(fixture(), NOW);
  keys = await permitKeyPair();
});

const issue = (
  over: {
    fields?: SignInput;
    nowMs?: number;
    lifetimeMs?: number;
    audience?: string;
  } = {}
) =>
  issuePermit({
    privateKey: keys.privateKey,
    audience: over.audience ?? AUDIENCE,
    fields: over.fields ?? input,
    id: randomToken(),
    nowMs: over.nowMs ?? NOW,
    lifetimeMs: over.lifetimeMs,
  });

const check = (
  permit: unknown,
  fields: Record<string, unknown> & { kid: string } = input,
  nowMs = NOW,
  audience: string | null = AUDIENCE
) =>
  verifyPermit({
    permit,
    fields,
    keys: parseKeySet(keys.publicKey),
    audience,
    nowMs,
  });

/** Every leaf path of the structured input, so a new field is covered too. */
function leafPaths(value: unknown, prefix: string[] = []): string[][] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, [...prefix, key])
  );
}

function mutate(value: SignInput, path: string[]): SignInput {
  const copy = structuredClone(value) as Record<string, unknown>;
  let node = copy;
  for (const key of path.slice(0, -1))
    node = node[key] as Record<string, unknown>;
  const last = path.at(-1) as string;
  const current = node[last];
  node[last] = typeof current === 'boolean' ? !current : `${String(current)}x`;
  return copy as SignInput;
}

describe('finalization permit', () => {
  it('accepts a fresh permit over the exact fields', async () => {
    const permit = await issue();
    expect(await check(permit)).toEqual({ ok: true, permit });
  });

  it('refuses a permit signed by another key, or with a changed signature or claim', async () => {
    const other = await permitKeyPair();
    const foreign = await issuePermit({
      privateKey: other.privateKey,
      audience: AUDIENCE,
      fields: input,
      id: randomToken(),
      nowMs: NOW,
    });
    expect(await check(foreign)).toEqual({
      ok: false,
      error: 'permit_invalid',
    });
    const permit = await issue();
    const sig = `${permit.sig[0] === 'A' ? 'B' : 'A'}${permit.sig.slice(1)}`;
    expect((await check({ ...permit, sig })).ok).toBe(false);
    expect((await check({ ...permit, exp: permit.exp + 1 })).ok).toBe(false);
    expect((await check({ ...permit, id: randomToken() })).ok).toBe(false);
    expect((await check({ ...permit, extra: 1 })).ok).toBe(false);
    expect((await check({ ...permit, aud: 'production' })).ok).toBe(false);
    expect((await check({ ...permit, v: 1 })).ok).toBe(false);
  });

  it('refuses a permit minted for another environment', async () => {
    const production = await issue({ audience: 'production' });
    expect(await check(production, input, NOW, 'production')).toMatchObject({
      ok: true,
    });
    expect(await check(production, input, NOW, 'local')).toEqual({
      ok: false,
      error: 'permit_invalid',
    });
    // An audience outside the known environments never parses.
    expect(await check(await issue({ audience: 'staging' }))).toEqual({
      ok: false,
      error: 'permit_invalid',
    });
    expect(await check(production, input, NOW, null)).toEqual({
      ok: false,
      error: 'misconfigured',
    });
  });

  it('refuses an expired permit, one issued in the future and one longer than 60 seconds', async () => {
    const permit = await issue();
    expect(await check(permit, input, permit.exp)).toEqual({
      ok: false,
      error: 'permit_expired',
    });
    expect(await check(await issue({ nowMs: NOW + 5_001 }))).toEqual({
      ok: false,
      error: 'permit_expired',
    });
    expect(await check(await issue({ lifetimeMs: 60_001 }))).toEqual({
      ok: false,
      error: 'permit_invalid',
    });
    expect(await check(await issue({ lifetimeMs: 0 }))).toEqual({
      ok: false,
      error: 'permit_invalid',
    });
  });

  it('covers every structured field', async () => {
    const permit = await issue();
    const paths = leafPaths(input);
    expect(paths.map((path) => path.join('.')).sort()).toEqual([
      'assurance.authenticatedAt',
      'assurance.mfaVerifiedAt',
      'attributes.email',
      'attributes.firstName',
      'attributes.lastName',
      'client',
      'idp.entityId',
      'idp.ssoUrl',
      'kid',
      'notOnOrAfter',
      'profile.acsUrl',
      'profile.entityId',
      'protocol',
      'request.forceAuthn',
      'request.id',
      'request.issueInstant',
      'request.relayState',
      'subject',
      'transactionId',
    ]);
    for (const path of paths) {
      const result = await check(permit, mutate(input, path));
      expect(result, path.join('.')).toEqual({
        ok: false,
        error: 'permit_invalid',
      });
    }
  });

  it('distinguishes an absent relay state from an empty one', async () => {
    const { relayState: _drop, ...request } = input.request;
    const withoutRelay = { ...input, request };
    const permit = await issue({ fields: withoutRelay });
    expect((await check(permit, withoutRelay)).ok).toBe(true);
    expect(
      (
        await check(permit, {
          ...input,
          request: { ...request, relayState: '' },
        })
      ).ok
    ).toBe(false);
  });

  it('refuses fields with no canonical form as an invalid permit, never a throw', async () => {
    const permit = await issue();
    for (const relayState of ['\ud800', 'a\udfffb']) {
      expect(
        await check(permit, {
          ...input,
          request: { ...input.request, relayState },
        })
      ).toEqual({ ok: false, error: 'permit_invalid' });
    }
  });

  it('accepts the previous public key during a rotation and refuses without a key', async () => {
    const next = await permitKeyPair();
    const permit = await issue();
    const rotation = parseKeySet(
      JSON.stringify({ current: next.publicKey, previous: keys.publicKey })
    );
    expect(
      (
        await verifyPermit({
          permit,
          fields: input,
          keys: rotation,
          audience: AUDIENCE,
          nowMs: NOW,
        })
      ).ok
    ).toBe(true);
    expect(
      await verifyPermit({
        permit,
        fields: input,
        keys: null,
        audience: AUDIENCE,
        nowMs: NOW,
      })
    ).toEqual({ ok: false, error: 'misconfigured' });
  });
});

describe('canonical JSON', () => {
  it('sorts keys at every depth and omits undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: true, c: 'x', e: undefined } })).toBe(
      '{"a":{"c":"x","d":true},"b":1}'
    );
  });

  it('refuses values with no canonical form', () => {
    for (const value of [[1], 1.5, null, () => 1]) {
      expect(() => canonicalJson({ a: value })).toThrow(TypeError);
    }
  });
});
