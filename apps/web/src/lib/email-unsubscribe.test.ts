import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmailUnsubscribeToken,
  verifyEmailUnsubscribeToken,
} from './email-unsubscribe';

const CURRENT = 'current-secret-'.padEnd(40, 'c');
const NEXT = 'next-secret-'.padEnd(40, 'n');

function setEnv(env: Record<string, string>) {
  for (const name of [
    'TUTURUUU_EMAIL_UNSUBSCRIBE_SECRET',
    'EMAIL_UNSUBSCRIBE_SECRET',
    'TUTURUUU_APP_COORDINATION_SECRET',
    'NEXTAUTH_SECRET',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'APP_COORDINATION_TOKEN_NEXT_SECRET',
    'APP_COORDINATION_TOKEN_SIGNER',
    'APP_COORDINATION_TOKEN_DISABLE_SUPABASE_FALLBACK',
  ]) {
    vi.stubEnv(name, '');
  }
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
}

describe('email unsubscribe secret chain', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('signs with the existing chain and accepts the next secret only', () => {
    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      APP_COORDINATION_TOKEN_NEXT_SECRET: NEXT,
    });
    const token = createEmailUnsubscribeToken('a@example.com');

    expect(verifyEmailUnsubscribeToken(token, { secret: CURRENT }).ok).toBe(
      true
    );
    expect(verifyEmailUnsubscribeToken(token, { secret: NEXT }).ok).toBe(false);
    expect(
      verifyEmailUnsubscribeToken(
        createEmailUnsubscribeToken('a@example.com', { secret: NEXT })
      ).ok
    ).toBe(true);
  });

  it('signs with the next secret after promotion and still verifies old tokens', () => {
    setEnv({ TUTURUUU_APP_COORDINATION_SECRET: CURRENT });
    const oldToken = createEmailUnsubscribeToken('a@example.com');

    setEnv({
      TUTURUUU_APP_COORDINATION_SECRET: CURRENT,
      APP_COORDINATION_TOKEN_NEXT_SECRET: NEXT,
      APP_COORDINATION_TOKEN_SIGNER: 'next',
    });
    const newToken = createEmailUnsubscribeToken('a@example.com');

    expect(verifyEmailUnsubscribeToken(newToken, { secret: NEXT }).ok).toBe(
      true
    );
    expect(verifyEmailUnsubscribeToken(oldToken).ok).toBe(true);
  });
});
