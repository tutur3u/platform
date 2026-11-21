import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSigner,
  ENV,
  type GuardSigner,
  listFields,
  NOW,
  signList,
  signText,
} from '../__tests__/guard-fixtures';
import { canonicalJson, encodeBase64Url } from '../encoding';
import { parseEmergencyKids } from '../tokens';
import { type GuardPin, verifyGuardResponse } from './guard-response';
import {
  acceptGuardResponse,
  emergencyKidsJson,
  GUARD_LIST_MAX_AGE_MS,
  guardReadView,
  type HeldGuardList,
  nextHeldGuardList,
} from './guard-state';

let current: GuardSigner;
let previous: GuardSigner;
let stranger: GuardSigner;
let pin: GuardPin;

beforeAll(async () => {
  current = await createSigner('guard-k2');
  previous = await createSigner('guard-k1');
  stranger = await createSigner('guard-k9');
  pin = { current: current.pin, previous: previous.pin };
});

const verify = (body: string, nowMs = NOW) =>
  verifyGuardResponse(body, { pin, expectedEnv: ENV, nowMs });

const accept = (body: string, held: HeldGuardList | null, nowMs = NOW) =>
  acceptGuardResponse(body, { pin, expectedEnv: ENV, nowMs, held });

async function heldFrom(over = {}): Promise<HeldGuardList> {
  const result = await accept(await signList(current, over), null);
  if (result.outcome !== 'accepted') throw new Error(result.outcome);
  return result.held as HeldGuardList;
}

describe('verifyGuardResponse', () => {
  it('accepts a list signed by the pin current key and sorts gatewayVersions', async () => {
    const result = await verify(await signList(current));
    expect(result).toMatchObject({
      ok: true,
      list: { listVersion: 7, gatewayVersions: ['gw-a', 'gw-b'] },
    });
  });

  it('accepts a list signed by the pin previous key', async () => {
    expect((await verify(await signList(previous))).ok).toBe(true);
  });

  it('rejects a key the pin does not name', async () => {
    expect(await verify(await signList(stranger))).toEqual({
      ok: false,
      reason: 'unknown_key',
    });
  });

  it('rejects a pinned keyId whose signature came from another key', async () => {
    const text = canonicalJson(listFields()) as string;
    const body = await signText(stranger, text, current.keyId);
    expect(await verify(body)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a payload changed after signing', async () => {
    const body = JSON.parse(await signList(current));
    const other = await signList(current, { mintHalt: true });
    body.payload = JSON.parse(other).payload;
    expect(await verify(JSON.stringify(body))).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it.each([
    ['whitespace', (text: string) => text.replace(',', ', ')],
    [
      'unsorted members',
      () =>
        '{"listVersion":7,"env":"production","gatewayVersions":[],"identityBlocked":false,"issuedAtMs":1800000000000,"kids":[],"mintHalt":false}',
    ],
    ['a duplicate member', (text: string) => text.replace('{', '{"env":"x",')],
    ['a non-canonical number', (text: string) => text.replace(':7,', ':7.0,')],
  ])('rejects a correctly signed payload with %s', async (_, mutate) => {
    const text = mutate(canonicalJson(listFields()) as string);
    expect(await verify(await signText(current, text))).toEqual({
      ok: false,
      reason: 'non_canonical',
    });
  });

  it('rejects a wrong environment', async () => {
    expect(await verify(await signList(current, { env: 'staging' }))).toEqual({
      ok: false,
      reason: 'wrong_env',
    });
  });

  it('accepts issuedAtMs 5 seconds ahead and rejects more', async () => {
    const ahead = await signList(current, { issuedAtMs: NOW + 5_000 });
    expect((await verify(ahead)).ok).toBe(true);
    const further = await signList(current, { issuedAtMs: NOW + 5_001 });
    expect(await verify(further)).toEqual({
      ok: false,
      reason: 'future_issued',
    });
  });

  it.each([
    ['an extra member', { extra: true }],
    ['a missing member', { mintHalt: undefined }],
    [
      'two kids for one class',
      {
        kids: [
          { class: 'identity', kid: 'a' },
          { class: 'identity', kid: 'b' },
        ],
      },
    ],
    ['an unknown class', { kids: [{ class: 'nope', kid: 'a' }] }],
    ['a duplicate gateway version', { gatewayVersions: ['v', 'v'] }],
    ['a string listVersion', { listVersion: '7' }],
    ['a negative issuedAtMs', { issuedAtMs: -1 }],
  ])('rejects %s', async (_, over) => {
    const fields = listFields(over);
    if ('mintHalt' in over && over.mintHalt === undefined) {
      delete fields.mintHalt;
    }
    const text = canonicalJson(fields) as string;
    expect(await verify(await signText(current, text))).toEqual({
      ok: false,
      reason: 'bad_payload',
    });
  });

  it('rejects extra outer members and non-JSON bodies', async () => {
    const body = JSON.parse(await signList(current));
    expect(await verify(JSON.stringify({ ...body, more: 1 }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(await verify('not json')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects a malformed pin', async () => {
    const body = await signList(current);
    const short = {
      keyId: 'k',
      publicKey: encodeBase64Url(new Uint8Array(31)),
    };
    for (const bad of [
      { current: short },
      {
        current: current.pin,
        previous: { ...previous.pin, keyId: 'guard-k2' },
      },
    ]) {
      expect(
        await verifyGuardResponse(body, {
          pin: bad,
          expectedEnv: ENV,
          nowMs: NOW,
        })
      ).toEqual({ ok: false, reason: 'bad_pin' });
    }
  });

  it('hands kids to slice 2a as TTR_TOKEN_EMERGENCY_KIDS', async () => {
    const held = await heldFrom({ kids: [{ class: 'identity', kid: 'id-2' }] });
    const parsed = parseEmergencyKids(
      emergencyKidsJson(guardReadView(held, NOW))
    );
    expect(parsed.armed).toEqual({ identity: ['id-2'] });
    expect(parsed.ignored).toBe(0);
  });
});

describe('held list transitions', () => {
  it('replaces the held list on a greater listVersion', async () => {
    const held = await heldFrom();
    const next = await accept(
      await signList(current, { listVersion: 8, mintHalt: true }),
      held
    );
    expect(next.outcome).toBe('accepted');
    expect(next.held?.list).toMatchObject({ listVersion: 8, mintHalt: true });
  });

  it('refreshes on an equal version with the same content, gatewayVersions as a sorted array', async () => {
    const held = await heldFrom({ gatewayVersions: ['gw-b', 'gw-a'] });
    const next = await accept(
      await signList(current, {
        gatewayVersions: ['gw-a', 'gw-b'],
        issuedAtMs: NOW + 60_000,
      }),
      held,
      NOW + 60_000
    );
    expect(next.outcome).toBe('refreshed');
    expect(next.held?.list.issuedAtMs).toBe(NOW + 60_000);
    expect(next.alert).toBe(false);
  });

  it('never moves issuedAtMs backwards on an equal replay', async () => {
    const held = await heldFrom({ issuedAtMs: NOW });
    const next = await accept(
      await signList(current, { issuedAtMs: NOW - 1_000 }),
      held
    );
    expect(next.outcome).toBe('unchanged');
    expect(next.held).toBe(held);
  });

  it.each([
    ['mintHalt', { mintHalt: true }],
    ['identityBlocked', { identityBlocked: true }],
    ['gatewayVersions', { gatewayVersions: ['gw-a'] }],
    ['kids', { kids: [{ class: 'identity', kid: 'id-3' }] }],
  ])('rejects equal-version different %s as a conflict', async (_, over) => {
    const held = await heldFrom();
    const next = await accept(
      await signList(current, { ...over, issuedAtMs: NOW + 1 }),
      held
    );
    expect(next).toMatchObject({ outcome: 'conflict', alert: true });
    expect(next.held).toBe(held);
  });

  it('rejects a lower listVersion as a rollback', async () => {
    const held = await heldFrom({ listVersion: 7 });
    const next = await accept(
      await signList(current, { listVersion: 6, issuedAtMs: NOW + 1 }),
      held
    );
    expect(next).toMatchObject({ outcome: 'rollback', alert: true });
    expect(next.held).toBe(held);
  });

  it('rejects a rollback and a conflict after a restart and in a cold isolate', async () => {
    const stored = await heldFrom({ listVersion: 9 });
    // A restarted object or a cold isolate re-verifies the stored bytes.
    const restored = await accept(stored.body, null);
    expect(restored.outcome).toBe('accepted');
    const lower = await accept(
      await signList(current, { listVersion: 8 }),
      restored.held as HeldGuardList
    );
    expect(lower.outcome).toBe('rollback');
    const different = await accept(
      await signList(current, { listVersion: 9, mintHalt: true }),
      restored.held as HeldGuardList
    );
    expect(different.outcome).toBe('conflict');
  });

  it('keeps the held list on an invalid response', async () => {
    const held = await heldFrom();
    const next = await accept(await signList(stranger), held);
    expect(next).toMatchObject({
      outcome: 'invalid',
      reason: 'unknown_key',
      alert: true,
    });
    expect(next.held).toBe(held);
  });

  it('is the same transition without verification', async () => {
    const held = await heldFrom();
    expect(nextHeldGuardList(null, held).outcome).toBe('accepted');
    expect(nextHeldGuardList(held, held).outcome).toBe('unchanged');
  });
});

describe('guardReadView', () => {
  it('keeps the held list in force at 300 seconds and lapses kids and mintHalt at 301', async () => {
    const held = await heldFrom({
      kids: [{ class: 'identity', kid: 'id-2' }],
      mintHalt: true,
      identityBlocked: true,
    });
    const atLimit = guardReadView(held, NOW + GUARD_LIST_MAX_AGE_MS);
    expect(atLimit).toMatchObject({
      lapsed: false,
      mintHalt: true,
      kids: [{ class: 'identity', kid: 'id-2' }],
    });
    const lapsed = guardReadView(held, NOW + 301_000);
    expect(lapsed).toEqual({
      kids: [],
      mintHalt: false,
      gatewayVersions: ['gw-a', 'gw-b'],
      identityBlocked: true,
      lapsed: true,
      listVersion: 7,
    });
  });

  it('restores a served mintHalt when an equal list with a new issuedAtMs arrives after the lapse', async () => {
    const held = await heldFrom({ mintHalt: true });
    const later = NOW + 400_000;
    expect(guardReadView(held, later).mintHalt).toBe(false);
    const next = await accept(
      await signList(current, { mintHalt: true, issuedAtMs: later }),
      held,
      later
    );
    expect(next.outcome).toBe('refreshed');
    expect(guardReadView(next.held as HeldGuardList, later).mintHalt).toBe(
      true
    );
  });

  it('reads no accepted gateway version and a blocked identity class with no held list', () => {
    expect(guardReadView(null, NOW)).toEqual({
      kids: [],
      mintHalt: false,
      gatewayVersions: [],
      identityBlocked: true,
      lapsed: true,
      listVersion: null,
    });
  });
});
