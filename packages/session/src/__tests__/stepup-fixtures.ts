/** Step-up proof scenarios and port doubles. Test-only by path. */
import type { UserId } from '../principal';
import {
  type SessionLivenessInput,
  type SessionLivenessPort,
  type SessionLivenessResult,
  type StepUpConsumeInput,
  type StepUpConsumePort,
  type StepUpConsumeResult,
  paramsHash,
  type StepUpVerifyOptions,
} from '../stepup';
import { signCompact, TEST_USER_ID } from '../testing';
import { type TokenClass, TOKEN_TYPES } from '../tokens';
import { createWorld, mintClaims, NOW, type World } from './token-fixtures';

export const USER = TEST_USER_ID as UserId;
export const OTHER_USER = '7c3e9a1b-2d4f-4e6a-8b0c-1d2e3f4a5b6c' as UserId;
export const ACT = 'vault.pin-eval' as const;
export const CHALLENGE_ID = 'challenge-1';
export const JTI = 'BBBBBBBBBBBBBBBBBBBBBA';
export const NONCE = 'CQkJCQkJCQkJCQkJCQkJCQ';

/** The vault's bound values for one stored challenge. */
export const PARAMS = Object.freeze({
  challenge: NONCE,
  wrapVersion: 3,
  clientKey: 'AQIDBA',
  blindedElementHash: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
});

export type StepUpWorld = World & {
  hash: Uint8Array;
  ph: string;
  /** Full proof claims at `NOW`, with `patch` applied; `undefined` removes a member. */
  claims(patch?: Record<string, unknown>): Record<string, unknown>;
  /** Signs claims with `keyClass`'s key under `typClass`'s header type. */
  sign(
    claims: Record<string, unknown>,
    keyClass?: TokenClass,
    typClass?: TokenClass
  ): Promise<string>;
  options(overrides?: Partial<StepUpVerifyOptions>): StepUpVerifyOptions;
};

export async function createStepUpWorld(
  classes?: readonly TokenClass[]
): Promise<StepUpWorld> {
  const world = await createWorld(classes);
  const hashed = await paramsHash(ACT, PARAMS);
  if (!hashed.ok) throw new Error(hashed.reason);
  const claims = (patch: Record<string, unknown> = {}) => {
    const full: Record<string, unknown> = {
      ...mintClaims('stepup'),
      ph: hashed.ph,
      nonce: NONCE,
      iat: NOW,
      jti: JTI,
      ...patch,
    };
    for (const [key, value] of Object.entries(full)) {
      if (value === undefined) delete full[key];
    }
    return full;
  };
  const sign = (
    payload: Record<string, unknown>,
    keyClass: TokenClass = 'stepup',
    typClass: TokenClass = keyClass
  ) =>
    signCompact(
      world.pairs[keyClass].privateKey,
      JSON.stringify({
        alg: 'ES256',
        typ: TOKEN_TYPES[typClass],
        kid: `${keyClass}-1`,
      }),
      JSON.stringify(payload)
    );
  const options = (
    overrides: Partial<StepUpVerifyOptions> = {}
  ): StepUpVerifyOptions => {
    const base = world.verifyOptions('stepup');
    return {
      issuer: base.issuer,
      environment: base.environment,
      keys: base.keys,
      now: base.now,
      audience: 'stepup:vault',
      subject: USER,
      act: ACT,
      expectedParamsHash: hashed.hash,
      allowedAmr: ['totp', 'passkey'],
      ...overrides,
    };
  };
  return { ...world, hash: hashed.hash, ph: hashed.ph, claims, sign, options };
}

/**
 * An in-memory single-use challenge store with the port's contract: a nonce
 * is accepted only for the challenge and subject it was issued for, and a
 * spent nonce or `jti` is `replayed`.
 */
export function createConsumeStore(
  outcome?: () => Promise<StepUpConsumeResult>
) {
  const challenges = new Map<
    string,
    { challengeId: string; subject: string }
  >();
  const spentNonces = new Set<string>();
  const spentJtis = new Set<string>();
  const calls: StepUpConsumeInput[] = [];
  const port: StepUpConsumePort = {
    async consume(input) {
      calls.push(input);
      if (outcome) return outcome();
      if (spentJtis.has(input.jti) || spentNonces.has(input.nonce)) {
        return 'replayed';
      }
      const challenge = challenges.get(input.nonce);
      if (
        !challenge ||
        challenge.challengeId !== input.challengeId ||
        challenge.subject !== input.subject
      ) {
        return 'unknown_nonce';
      }
      spentNonces.add(input.nonce);
      spentJtis.add(input.jti);
      return 'consumed';
    },
  };
  return {
    port,
    calls,
    spentNonces,
    spentJtis,
    issue(nonce: string, challengeId = CHALLENGE_ID, subject: string = USER) {
      challenges.set(nonce, { challengeId, subject });
    },
  };
}

export function createLiveness(
  result: () => Promise<SessionLivenessResult> = async () => 'live'
) {
  const calls: SessionLivenessInput[] = [];
  const port: SessionLivenessPort = {
    async check(input) {
      calls.push(input);
      return result();
    },
  };
  return { port, calls };
}
