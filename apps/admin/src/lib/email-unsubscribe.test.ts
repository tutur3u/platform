import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('production requires a configured secret and preserves signed token verification', async () => {
  vi.stubEnv('NODE_ENV', 'production');
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
  ])
    vi.stubEnv(name, '');
  const { createEmailUnsubscribeToken, verifyEmailUnsubscribeToken } =
    await import('./email-unsubscribe');
  expect(() => createEmailUnsubscribeToken('reader@example.invalid')).toThrow(
    'Missing TUTURUUU_EMAIL_UNSUBSCRIBE_SECRET'
  );
  const token = createEmailUnsubscribeToken(' Reader@Example.invalid ', {
    secret: 'fixture-only',
  });
  expect(
    verifyEmailUnsubscribeToken(token, { secret: 'fixture-only' })
  ).toMatchObject({ ok: true, claims: { email: 'reader@example.invalid' } });
  expect(
    verifyEmailUnsubscribeToken(token, { secret: 'another-fixture' })
  ).toEqual({ ok: false, error: 'invalid_signature' });
});
it('development retains its local token round trip', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const { createEmailUnsubscribeToken, verifyEmailUnsubscribeToken } =
    await import('./email-unsubscribe');
  expect(
    verifyEmailUnsubscribeToken(
      createEmailUnsubscribeToken('reader@example.invalid', { secret: ' ' }),
      { secret: ' ' }
    )
  ).toMatchObject({ ok: true });
});
