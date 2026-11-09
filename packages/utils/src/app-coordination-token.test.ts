// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_COORDINATION_SECRET_ENV_NAMES,
  createAppCoordinationToken,
  createSessionAssuranceTransferToken,
  getServerTokenSecretCandidates,
  verifyAppCoordinationToken,
  verifySessionAssuranceTransferToken,
} from './app-coordination-token';
import {
  createSignedAccessToken,
  verifySignedAccessToken,
} from './signed-access-token';

const NEXT = 'APP_COORDINATION_TOKEN_NEXT_SECRET';
const SIGNER = 'APP_COORDINATION_TOKEN_SIGNER';
const DISABLE = 'APP_COORDINATION_TOKEN_DISABLE_SUPABASE_FALLBACK';
const CURRENT = 'current-secret-'.padEnd(40, 'c');
const NEXT_VALUE = 'next-secret-'.padEnd(40, 'n');
const SUPABASE = 'supabase-secret-'.padEnd(40, 's');
const payload = { targetApp: 'tasks', userId: 'user-1' };

function setEnv(env: Record<string, string | undefined>) {
  for (const name of [
    ...APP_COORDINATION_SECRET_ENV_NAMES,
    NEXT,
    SIGNER,
    DISABLE,
  ]) {
    vi.stubEnv(name, '');
  }
  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value ?? '');
  }
}

function signsWith(secret: string, token: string) {
  return verifyAppCoordinationToken(token, { secret }).ok;
}

describe('app coordination secret chain', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the existing chain and order when no new env name is set', () => {
    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      APP_COORDINATION_TOKEN_SECRET: 'legacy',
      SUPABASE_SECRET_KEY: SUPABASE,
      SUPABASE_SERVICE_ROLE_KEY: CURRENT,
      SUPABASE_SERVICE_KEY: ' service ',
    });

    expect(getServerTokenSecretCandidates()).toEqual([
      CURRENT,
      'legacy',
      SUPABASE,
      'service',
    ]);
    expect(signsWith(CURRENT, createAppCoordinationToken(payload).token)).toBe(
      true
    );
  });

  it('falls back to the local development secret outside production and throws in production', () => {
    setEnv({});
    expect(getServerTokenSecretCandidates()).toHaveLength(1);

    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getServerTokenSecretCandidates()).toThrow(
      'Missing TUTURUUU_APP_COORDINATION_SECRET or SUPABASE_SECRET_KEY'
    );
  });

  it('accepts the next secret but never signs with it while the chain has a value', () => {
    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      [NEXT]: NEXT_VALUE,
    });

    expect(getServerTokenSecretCandidates()).toEqual([CURRENT, NEXT_VALUE]);
    const { token } = createAppCoordinationToken(payload);

    expect(signsWith(CURRENT, token)).toBe(true);
    expect(signsWith(NEXT_VALUE, token)).toBe(false);
  });

  it('keeps an explicit signer of current accept-only', () => {
    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      [NEXT]: NEXT_VALUE,
      [SIGNER]: 'current',
    });

    expect(getServerTokenSecretCandidates()[0]).toBe(CURRENT);
  });

  it('verifies a token signed with the next secret on a verifier that only has it as next', () => {
    const { token } = createAppCoordinationToken(payload, {
      secret: NEXT_VALUE,
    });

    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      [NEXT]: NEXT_VALUE,
    });
    expect(verifyAppCoordinationToken(token)).toMatchObject({ ok: true });

    setEnv({ TUTURUUU_APP_COORDINATION_SECRET: CURRENT });
    expect(verifyAppCoordinationToken(token)).toMatchObject({
      error: 'Invalid token signature',
      ok: false,
    });
  });

  it('signs with next after promotion while tokens from the old signer still verify', () => {
    setEnv({ TUTURUUU_APP_COORDINATION_SECRET: CURRENT });
    const oldToken = createAppCoordinationToken(payload).token;

    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      [NEXT]: NEXT_VALUE,
      [SIGNER]: 'next',
    });
    expect(getServerTokenSecretCandidates()).toEqual([NEXT_VALUE, CURRENT]);
    const newToken = createAppCoordinationToken(payload).token;

    expect(signsWith(NEXT_VALUE, newToken)).toBe(true);
    expect(signsWith(CURRENT, newToken)).toBe(false);
    expect(verifyAppCoordinationToken(oldToken)).toMatchObject({ ok: true });
    expect(verifyAppCoordinationToken(newToken)).toMatchObject({ ok: true });
  });

  it('fails closed when promotion is selected without a next secret', () => {
    setEnv({ TUTURUUU_APP_COORDINATION_SECRET: CURRENT, [SIGNER]: 'next' });

    expect(() => createAppCoordinationToken(payload)).toThrow(
      `${SIGNER}=next requires ${NEXT}`
    );
  });

  it('rejects an unknown signer selection', () => {
    setEnv({ TUTURUUU_APP_COORDINATION_SECRET: CURRENT, [SIGNER]: 'both' });

    expect(() => getServerTokenSecretCandidates()).toThrow(
      `${SIGNER} must be "current" or "next"`
    );
  });

  it('rejects a next secret shorter than 32 characters', () => {
    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      [NEXT]: 'a'.repeat(31),
    });

    expect(() => getServerTokenSecretCandidates()).toThrow(
      `${NEXT} must be at least 32 characters`
    );
    expect(() => createAppCoordinationToken(payload)).toThrow(
      `${NEXT} must be at least 32 characters`
    );

    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      [NEXT]: ` ${'a'.repeat(31)} `,
    });
    expect(() => getServerTokenSecretCandidates()).toThrow(
      'at least 32 characters'
    );

    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      [NEXT]: 'a'.repeat(32),
    });
    expect(getServerTokenSecretCandidates()).toEqual([CURRENT, 'a'.repeat(32)]);
  });

  describe('Supabase fallback removal', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('removes the SUPABASE_* names in production once the flag is set', () => {
      setEnv({
        TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
        SUPABASE_SECRET_KEY: SUPABASE,
        SUPABASE_SERVICE_ROLE_KEY: 'role',
        SUPABASE_SERVICE_KEY: 'service',
      });
      expect(getServerTokenSecretCandidates()).toEqual([
        CURRENT,
        SUPABASE,
        'role',
        'service',
      ]);

      setEnv({
        TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
        SUPABASE_SECRET_KEY: SUPABASE,
        SUPABASE_SERVICE_ROLE_KEY: 'role',
        SUPABASE_SERVICE_KEY: 'service',
        [DISABLE]: '1',
      });
      expect(getServerTokenSecretCandidates()).toEqual([CURRENT]);

      const supabaseToken = createAppCoordinationToken(payload, {
        secret: SUPABASE,
      }).token;
      expect(verifyAppCoordinationToken(supabaseToken)).toMatchObject({
        ok: false,
      });
    });

    it('fails closed when removing the fallbacks leaves an empty list', () => {
      setEnv({ SUPABASE_SECRET_KEY: SUPABASE, [DISABLE]: 'true' });

      expect(() => getServerTokenSecretCandidates()).toThrow(DISABLE);
      expect(() => createAppCoordinationToken(payload)).toThrow(DISABLE);
      expect(() => verifyAppCoordinationToken('ttr_app_a.b.c')).toThrow(
        DISABLE
      );
    });

    it('lets the next secret carry the list when the fallbacks are removed', () => {
      setEnv({
        SUPABASE_SECRET_KEY: SUPABASE,
        [NEXT]: NEXT_VALUE,
        [DISABLE]: '1',
      });

      expect(getServerTokenSecretCandidates()).toEqual([NEXT_VALUE]);
    });

    it('rejects an unrecognised flag value', () => {
      setEnv({ TUTURUUU_APP_COORDINATION_SECRET: CURRENT, [DISABLE]: 'yes' });

      expect(() => getServerTokenSecretCandidates()).toThrow(DISABLE);
    });

    it('does not apply the flag outside production', () => {
      vi.stubEnv('NODE_ENV', 'test');
      setEnv({ SUPABASE_SECRET_KEY: SUPABASE, [DISABLE]: '1' });

      expect(getServerTokenSecretCandidates()).toEqual([SUPABASE]);
    });
  });

  it('applies the same rules to purpose-bound tokens', () => {
    setEnv({ TUTURUUU_APP_COORDINATION_SECRET: CURRENT });
    const signedBefore = createSignedAccessToken(
      'meet-guest',
      { sub: 'a' },
      60
    );
    const transferBefore = createSessionAssuranceTransferToken(payload).token;

    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      [NEXT]: NEXT_VALUE,
      [SIGNER]: 'next',
    });
    const signedAfter = createSignedAccessToken('meet-guest', { sub: 'a' }, 60);
    const transferAfter = createSessionAssuranceTransferToken(payload).token;

    expect(
      verifySignedAccessToken('meet-guest', signedBefore.token)
    ).toMatchObject({ sub: 'a' });
    expect(
      verifySignedAccessToken('meet-guest', signedAfter.token, {
        secret: NEXT_VALUE,
      })
    ).toMatchObject({ sub: 'a' });
    expect(
      verifySignedAccessToken('meet-guest', signedAfter.token, {
        secret: CURRENT,
      })
    ).toBeNull();
    expect(verifySessionAssuranceTransferToken(transferBefore).ok).toBe(true);
    expect(verifySessionAssuranceTransferToken(transferAfter).ok).toBe(true);
    expect(
      verifySessionAssuranceTransferToken(transferAfter, { secret: CURRENT }).ok
    ).toBe(false);
  });
});
