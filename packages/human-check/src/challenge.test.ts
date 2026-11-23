import { describe, expect, it } from 'vitest';
import {
  createJigsawChallenge,
  MAX_ATTEMPTS,
  redeemPassToken,
  verifyJigsawAttempt,
} from './challenge';
import { unseal } from './crypto';
import { fromBase64Url } from './encoding';
import { createMemoryStore } from './memory-store';
import { humanDrag } from './test-helpers';

const secret = 'test-secret-0123456789abcdef0123456789abcdef';
const scope = 'meet:7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const subject = '203.0.113.4';

async function slotX(token: string) {
  const state = await unseal<{ sx: number }>(secret, token);
  if (!state) throw new Error('unsealable');
  return state.sx;
}

function attempt(token: string, x: number, overrides = {}) {
  return verifyJigsawAttempt({
    secret,
    store,
    token,
    scope,
    subject,
    x,
    mode: 'pointer',
    trajectory: humanDrag(x),
    ...overrides,
  });
}

let store = createMemoryStore();

describe('createJigsawChallenge', () => {
  it('renders bounded PNG images and never exposes the slot position', async () => {
    const challenge = await createJigsawChallenge({
      secret,
      scope,
      subject,
      seed: 42,
    });
    const png = fromBase64Url(
      challenge.background
        .split(',')[1]!
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    );
    expect([...png.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
    expect(challenge.background.length).toBeLessThan(160_000);
    expect(challenge.piece.length).toBeLessThan(20_000);
    expect(Object.keys(challenge).sort()).toEqual(
      [
        'background',
        'expiresAt',
        'height',
        'piece',
        'pieceSize',
        'pieceY',
        'token',
        'width',
      ].sort()
    );
    expect(typeof (await slotX(challenge.token))).toBe('number');
    expect(await unseal(`${secret}-other`, challenge.token)).toBeNull();
    expect(challenge.expiresAt - Date.now()).toBeLessThanOrEqual(120_000);
  });

  it('is deterministic for a seed and varies across seeds', async () => {
    const a = await createJigsawChallenge({
      secret,
      scope,
      subject,
      seed: 7,
      geometrySeed: 1,
    });
    const b = await createJigsawChallenge({
      secret,
      scope,
      subject,
      seed: 7,
      geometrySeed: 1,
    });
    const c = await createJigsawChallenge({
      secret,
      scope,
      subject,
      seed: 8,
      geometrySeed: 1,
    });
    expect(a.background).toBe(b.background);
    expect(a.background).not.toBe(c.background);
  });
});

describe('verifyJigsawAttempt', () => {
  it('passes a human-like placement once and issues a single-use pass', async () => {
    store = createMemoryStore();
    const challenge = await createJigsawChallenge({ secret, scope, subject });
    const x = (await slotX(challenge.token)) + 2;
    const verdict = await attempt(challenge.token, x);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(await attempt(challenge.token, x)).toMatchObject({ ok: false });
    const redeem = { secret, store, token: verdict.passToken, scope, subject };
    expect(await redeemPassToken(redeem)).toMatchObject({ ok: true });
    expect(await redeemPassToken(redeem)).toEqual({ ok: false });
  });

  it('rejects a wrong position and caps attempts per challenge', async () => {
    store = createMemoryStore();
    const challenge = await createJigsawChallenge({ secret, scope, subject });
    const wrong = (await slotX(challenge.token)) + 20;
    for (let i = 1; i < MAX_ATTEMPTS; i += 1)
      expect(await attempt(challenge.token, wrong)).toMatchObject({
        reason: 'position',
        retry: true,
      });
    expect(await attempt(challenge.token, wrong)).toMatchObject({
      reason: 'position',
      retry: false,
    });
    const right = await slotX(challenge.token);
    expect(await attempt(challenge.token, right)).toMatchObject({
      reason: 'attempts',
    });
  });

  it('rejects robotic motion at the right position', async () => {
    store = createMemoryStore();
    const challenge = await createJigsawChallenge({ secret, scope, subject });
    const x = await slotX(challenge.token);
    const flat = Array.from({ length: 21 }, (_, i) => ({
      t: i * 25,
      x: (x * i) / 20,
      y: 80,
    }));
    expect(
      await attempt(challenge.token, x, { trajectory: flat })
    ).toMatchObject({ reason: 'motion' });
  });

  it('binds the challenge to its scope, subject and expiry', async () => {
    store = createMemoryStore();
    const now = Date.now();
    const challenge = await createJigsawChallenge({
      secret,
      scope,
      subject,
      now,
    });
    const x = await slotX(challenge.token);
    expect(
      await attempt(challenge.token, x, { scope: 'meet:other' })
    ).toMatchObject({ reason: 'invalid' });
    expect(
      await attempt(challenge.token, x, { subject: '198.51.100.9' })
    ).toMatchObject({ reason: 'invalid' });
    expect(
      await attempt(challenge.token, x, { now: now + 121_000 })
    ).toMatchObject({ reason: 'expired' });
    expect(await attempt(`${challenge.token}x`, x)).toMatchObject({
      reason: 'invalid',
    });
  });

  it('tightens tolerance and allows two placements at level 1', async () => {
    store = createMemoryStore();
    const challenge = await createJigsawChallenge({
      secret,
      scope,
      subject,
      level: 1,
    });
    const x = (await slotX(challenge.token)) + 5;
    expect(await attempt(challenge.token, x)).toMatchObject({
      reason: 'position',
      retry: true,
    });
    expect(await attempt(challenge.token, x)).toMatchObject({
      reason: 'position',
      retry: false,
    });
    expect(await attempt(challenge.token, x - 5)).toMatchObject({
      reason: 'attempts',
    });
  });

  it('draws geometry apart from the texture seed', async () => {
    const a = await createJigsawChallenge({ secret, scope, subject, seed: 7 });
    const b = await createJigsawChallenge({ secret, scope, subject, seed: 7 });
    expect(a.background).not.toBe(b.background);
  });
});

describe('redeemPassToken', () => {
  it('refuses forged, re-scoped and expired passes', async () => {
    store = createMemoryStore();
    const challenge = await createJigsawChallenge({ secret, scope, subject });
    const x = await slotX(challenge.token);
    const verdict = await attempt(challenge.token, x);
    if (!verdict.ok) throw new Error('expected pass');
    const [payload, mac] = verdict.passToken.split('.');
    const base = { secret, store, scope, subject };
    expect(
      await redeemPassToken({ ...base, token: `${payload}.${mac}A` })
    ).toEqual({ ok: false });
    expect(
      await redeemPassToken({
        ...base,
        token: verdict.passToken,
        scope: 'meet:x',
      })
    ).toEqual({ ok: false });
    expect(
      await redeemPassToken({
        ...base,
        token: verdict.passToken,
        now: verdict.expiresAt + 1,
      })
    ).toEqual({ ok: false });
    expect(
      await redeemPassToken({
        ...base,
        token: verdict.passToken,
        secret: `${secret}-other`,
      })
    ).toEqual({ ok: false });
  });
});
