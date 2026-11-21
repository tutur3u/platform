import { describe, expect, it, vi } from 'vitest';
import {
  CHALLENGE_ID,
  createConsumeStore,
  createLiveness,
  createStepUpWorld,
  NONCE,
  OTHER_USER,
  type StepUpWorld,
  USER,
} from '../__tests__/stepup-fixtures';
import { NOW } from '../__tests__/token-fixtures';
import {
  type AuthorizeStepUpOptions,
  authorizeStepUp,
  type SessionLivenessResult,
  type StepUpConsumeResult,
  type StepUpVerified,
  verifyStepUpProof,
} from '../stepup';

const NONCE_2 = 'CgoKCgoKCgoKCgoKCgoKCg';
const JTI_2 = 'BBBBBBBBBBBBBBBBBBBBBQ';

async function verified(
  world: StepUpWorld,
  patch: Record<string, unknown> = {},
  subject = USER
): Promise<StepUpVerified> {
  const token = await world.sign(world.claims(patch));
  const result = await verifyStepUpProof(token, world.options({ subject }));
  if (!result.ok) throw new Error(result.reason);
  return result;
}

/** A relying service: authorize first, and run the charged step only after `authorized`. */
async function relyingService(
  proof: StepUpVerified,
  options: Partial<AuthorizeStepUpOptions> & {
    consume: AuthorizeStepUpOptions['consume'];
  }
) {
  const charge = vi.fn();
  const liveness = options.liveness ?? createLiveness().port;
  const result = await authorizeStepUp(proof, {
    challengeId: CHALLENGE_ID,
    now: () => NOW,
    liveness,
    ...options,
  });
  if (result.ok) charge(result.authorization);
  return { result, charge };
}

const reasonOf = (result: Awaited<ReturnType<typeof authorizeStepUp>>) =>
  result.ok ? result.status : result.reason;

describe('authorizeStepUp', () => {
  it('authorizes a consumed proof of a live session, consume before liveness', async () => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    store.issue(NONCE);
    const order: string[] = [];
    const liveness = createLiveness(async () => {
      order.push(`liveness after ${store.calls.length} consume`);
      return 'live';
    });
    const { result, charge } = await relyingService(await verified(world), {
      consume: store.port,
      liveness: liveness.port,
    });
    expect(reasonOf(result)).toBe('authorized');
    expect(order).toEqual(['liveness after 1 consume']);
    expect(store.calls).toEqual([
      {
        subject: USER,
        nonce: NONCE,
        jti: 'BBBBBBBBBBBBBBBBBBBBBA',
        challengeId: CHALLENGE_ID,
        exp: NOW + 300,
      },
    ]);
    expect(liveness.calls).toEqual([
      { subject: USER, sessionId: 'AAAAAAAAAAAAAAAAAAAAAA', generation: 3 },
    ]);
    expect(charge).toHaveBeenCalledOnce();
    expect(result.ok && result.authorization).toEqual({
      subject: USER,
      sessionId: 'AAAAAAAAAAAAAAAAAAAAAA',
      generation: 3,
      act: 'vault.pin-eval',
      challengeId: CHALLENGE_ID,
      jti: 'BBBBBBBBBBBBBBBBBBBBBA',
    });
  });

  it('rejects a nonce the service never issued', async () => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    const liveness = createLiveness();
    const { result, charge } = await relyingService(await verified(world), {
      consume: store.port,
      liveness: liveness.port,
    });
    expect(reasonOf(result)).toBe('unknown_nonce');
    expect(liveness.calls).toEqual([]);
    expect(charge).not.toHaveBeenCalled();
  });

  it('rejects a nonce issued for another challenge', async () => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    store.issue(NONCE, 'challenge-2');
    const { result } = await relyingService(await verified(world), {
      consume: store.port,
    });
    expect(reasonOf(result)).toBe('unknown_nonce');
  });

  it("does not let a live proof of another user spend this user's challenge", async () => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    store.issue(NONCE, CHALLENGE_ID, USER);
    // The verifier binds `sub` to the challenge's subject...
    const token = await world.sign(world.claims({ sub: OTHER_USER }));
    expect(await verifyStepUpProof(token, world.options())).toEqual({
      ok: false,
      reason: 'subject_mismatch',
    });
    // ...and a proof verified for the other user cannot consume it either.
    const { result, charge } = await relyingService(
      await verified(world, { sub: OTHER_USER }, OTHER_USER),
      { consume: store.port }
    );
    expect(reasonOf(result)).toBe('unknown_nonce');
    expect(store.spentNonces.size).toBe(0);
    expect(charge).not.toHaveBeenCalled();
  });

  it('rejects a replayed jti with a fresh nonce', async () => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    store.issue(NONCE);
    store.issue(NONCE_2);
    const first = await relyingService(await verified(world), {
      consume: store.port,
    });
    expect(reasonOf(first.result)).toBe('authorized');
    const second = await relyingService(
      await verified(world, { nonce: NONCE_2 }),
      { consume: store.port }
    );
    expect(reasonOf(second.result)).toBe('replayed');
    expect(second.charge).not.toHaveBeenCalled();
  });

  it('rejects a replayed nonce with a new jti', async () => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    store.issue(NONCE);
    await relyingService(await verified(world), { consume: store.port });
    const second = await relyingService(await verified(world, { jti: JTI_2 }), {
      consume: store.port,
    });
    expect(reasonOf(second.result)).toBe('replayed');
    expect(second.charge).not.toHaveBeenCalled();
  });

  it('accepts each verified object once', async () => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    store.issue(NONCE);
    const proof = await verified(world);
    await relyingService(proof, { consume: store.port });
    const again = await relyingService(proof, { consume: store.port });
    expect(reasonOf(again.result)).toBe('not_verified');
    expect(store.calls).toHaveLength(1);
  });

  it('rejects an object the verifier did not return', async () => {
    const world = await createStepUpWorld(['stepup']);
    const proof = await verified(world);
    const store = createConsumeStore();
    const forged = { ...proof } as StepUpVerified;
    const { result } = await relyingService(forged, { consume: store.port });
    expect(reasonOf(result)).toBe('not_verified');
    expect(store.calls).toEqual([]);
  });

  it('rejects a proof that expired before authorization', async () => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    store.issue(NONCE);
    const { result } = await relyingService(await verified(world), {
      consume: store.port,
      now: () => NOW + 300,
    });
    expect(reasonOf(result)).toBe('expired');
    expect(store.calls).toEqual([]);
  });

  it.each<[string, () => Promise<StepUpConsumeResult>]>([
    ['unavailable', async () => 'unavailable'],
    ['an unexpected result', async () => 'ok' as never],
    [
      'a throwing port',
      async () => {
        throw new Error('storage down');
      },
    ],
  ])('fails closed when consume returns %s', async (_name, outcome) => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore(outcome);
    const liveness = createLiveness();
    const { result, charge } = await relyingService(await verified(world), {
      consume: store.port,
      liveness: liveness.port,
    });
    expect(reasonOf(result)).toBe('consume_unavailable');
    expect(liveness.calls).toEqual([]);
    expect(charge).not.toHaveBeenCalled();
  });

  it.each<[string, () => Promise<SessionLivenessResult>, string]>([
    ['revoked', async () => 'revoked', 'revoked'],
    ['superseded', async () => 'superseded', 'superseded'],
    ['unavailable', async () => 'unavailable', 'liveness_unavailable'],
    [
      'an unexpected result',
      async () => 'maybe' as never,
      'liveness_unavailable',
    ],
    [
      'a throwing port',
      async () => {
        throw new Error('epoch read failed');
      },
      'liveness_unavailable',
    ],
  ])(
    'fails closed with no charged step when liveness is %s, and the nonce stays spent',
    async (_name, live, expected) => {
      const world = await createStepUpWorld(['stepup']);
      const store = createConsumeStore();
      store.issue(NONCE);
      const { result, charge } = await relyingService(await verified(world), {
        consume: store.port,
        liveness: createLiveness(live).port,
      });
      expect(reasonOf(result)).toBe(expected);
      expect(charge).not.toHaveBeenCalled();
      expect(store.spentNonces.has(NONCE)).toBe(true);
      const retry = await relyingService(await verified(world), {
        consume: store.port,
      });
      expect(reasonOf(retry.result)).toBe('replayed');
      expect(retry.charge).not.toHaveBeenCalled();
    }
  );

  it.each<[string, Partial<AuthorizeStepUpOptions>]>([
    ['an empty challenge id', { challengeId: '' }],
    ['an oversized challenge id', { challengeId: 'c'.repeat(257) }],
    ['a missing clock', { now: undefined as never }],
    ['a non-finite clock', { now: () => Number.NaN }],
    ['a liveness port without check', { liveness: {} as never }],
  ])('fails closed with %s', async (_name, overrides) => {
    const world = await createStepUpWorld(['stepup']);
    const store = createConsumeStore();
    store.issue(NONCE);
    const { result } = await relyingService(await verified(world), {
      consume: store.port,
      ...overrides,
    });
    expect(reasonOf(result)).toBe('options');
    expect(store.calls).toEqual([]);
  });
});
