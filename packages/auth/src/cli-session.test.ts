import { describe, expect, it, vi } from 'vitest';
import { verifyAppSessionToken } from './app-session';
import {
  CLI_APP_REFRESH_SCOPE,
  createCliAppSession,
  createCliSessionResponseBody,
  verifyCliAccessToken,
  verifyCliRefreshToken,
} from './cli-session';

describe('CLI app-session JWTs', () => {
  it('creates gateway access and refresh JWTs with separated scopes', () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');

    const session = createCliAppSession(
      {
        accessExpiresInSeconds: 60,
        email: 'agent@example.com',
        refreshExpiresInSeconds: 120,
        userId: 'user-1',
      },
      { now: new Date('2026-01-01T00:00:00.000Z') }
    );

    expect(session.access.token).toMatch(/^ttr_app_/u);
    expect(session.refresh.token).toMatch(/^ttr_app_/u);
    expect(session.access.token).not.toBe(session.refresh.token);

    const accessVerification = verifyCliAccessToken(session.access.token, {
      now: new Date('2026-01-01T00:00:01.000Z'),
    });
    const refreshVerification = verifyCliRefreshToken(session.refresh.token, {
      now: new Date('2026-01-01T00:00:01.000Z'),
    });

    expect(accessVerification.ok).toBe(true);
    expect(refreshVerification.ok).toBe(true);
    if (refreshVerification.ok) {
      expect(refreshVerification.claims.scopes).toEqual([
        CLI_APP_REFRESH_SCOPE,
      ]);
    }
  });

  it('does not allow refresh JWTs to authenticate as app-session access tokens', () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');

    const session = createCliAppSession({
      userId: 'user-1',
    });

    expect(verifyAppSessionToken(session.refresh.token)).toEqual({
      error: 'App session missing required scope',
      ok: false,
    });
    expect(verifyCliAccessToken(session.refresh.token)).toEqual({
      error: 'App session missing required scope',
      ok: false,
    });
  });

  it('formats the CLI session response without Supabase token semantics', () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');

    const session = createCliAppSession(
      {
        accessExpiresInSeconds: 60,
        refreshExpiresInSeconds: 120,
        userId: 'user-1',
      },
      { now: new Date('2026-01-01T00:00:00.000Z') }
    );

    expect(createCliSessionResponseBody(session)).toMatchObject({
      session: {
        access_token: session.access.token,
        expires_at: session.access.claims.exp,
        expires_in: 60,
        refresh_expires_at: session.refresh.claims.exp,
        refresh_expires_in: 120,
        refresh_token: session.refresh.token,
        token_type: 'bearer',
      },
      sessionCreated: true,
      valid: true,
    });
  });
});
