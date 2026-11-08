import {
  createCliAppSession,
  verifyCliAccessToken,
  verifyCliRefreshToken,
} from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
}));

vi.mock('@/lib/app-coordination/session-policy', () => ({
  getCliAppSessionPolicy: vi.fn().mockResolvedValue({
    cliAccessTtlSeconds: 28_800,
    cliRefreshTtlSeconds: 7_776_000,
  }),
}));

describe('CLI auth refresh route', () => {
  let consoleWarn: ReturnType<typeof vi.spyOn>;
  let refreshReplaySet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    refreshReplaySet = vi.fn().mockResolvedValue('OK');
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue({
      set: refreshReplaySet,
    } as never);
    vi.mocked(createAdminClient).mockResolvedValue({
      auth: {
        admin: {
          getUserById: vi.fn(async (id: string) => ({
            data: {
              user: {
                email: 'agent@example.com',
                email_confirmed_at: '2026-06-01T00:00:00.000Z',
                id,
              },
            },
            error: null,
          })),
        },
      },
    } as never);
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    vi.unstubAllEnvs();
  });

  function refreshRequest(refreshToken: string) {
    return new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
      body: JSON.stringify({ refreshToken }),
      headers: { 'x-forwarded-for': '198.51.100.20' },
      method: 'POST',
    });
  }

  it('answers a known replay from memory once the store owns fences', async () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    refreshReplaySet.mockResolvedValue(null);
    const session = createCliAppSession({
      email: 'agent@example.com',
      userId: 'user-replay',
    });

    expect((await POST(refreshRequest(session.refresh.token))).status).toBe(
      401
    );
    expect((await POST(refreshRequest(session.refresh.token))).status).toBe(
      401
    );
    // The second replay never reached the store.
    expect(refreshReplaySet).toHaveBeenCalledTimes(1);
  });

  it('pre-limits one principal before spending store operations', async () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const session = createCliAppSession({
        email: 'agent@example.com',
        userId: 'user-flood',
      });
      const response = await POST(refreshRequest(session.refresh.token));
      statuses.push(response.status);
      if (response.status === 429) {
        expect(response.headers.get('Retry-After')).toBe('60');
      }
    }
    expect(statuses.indexOf(429)).toBe(20);
    expect(refreshReplaySet).toHaveBeenCalledTimes(20);
  });

  it('refreshes a CLI session from a Tuturuuu refresh JWT', async () => {
    const oldSession = createCliAppSession({
      email: 'agent@example.com',
      userId: 'user-1',
    });
    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
        body: JSON.stringify({ refreshToken: oldSession.refresh.token }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      session: {
        token_type: 'bearer',
      },
      sessionCreated: true,
      valid: true,
    });
    expect(body.session.access_token).toMatch(/^ttr_app_/u);
    expect(body.session.refresh_token).toMatch(/^ttr_app_/u);
    expect(body.session.access_token).not.toBe(oldSession.access.token);
    expect(body.session.refresh_token).not.toBe(oldSession.refresh.token);
    expect(getUpstashRestRedisClient).toHaveBeenCalledWith({
      family: 'replay',
      fairness: { principal: 'user-1', source: 'unknown' },
    });
    expect(refreshReplaySet).toHaveBeenCalledWith(
      `cli:refresh:used:user-1:${oldSession.refresh.claims.jti}`,
      '1',
      expect.objectContaining({
        ex: expect.any(Number),
        nx: true,
      })
    );
  });

  it('rejects app-session access tokens as refresh tokens', async () => {
    const oldSession = createCliAppSession({
      email: 'agent@example.com',
      userId: 'user-1',
    });

    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
        body: JSON.stringify({ refreshToken: oldSession.access.token }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(getUpstashRestRedisClient).not.toHaveBeenCalled();
  });

  it('rejects refresh tokens for deleted users', async () => {
    vi.mocked(createAdminClient).mockResolvedValueOnce({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: null,
            },
            error: null,
          }),
        },
      },
    } as never);
    const oldSession = createCliAppSession({
      userId: 'deleted-user',
    });
    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
        body: JSON.stringify({ refreshToken: oldSession.refresh.token }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects replayed refresh tokens after rotation', async () => {
    refreshReplaySet.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    const oldSession = createCliAppSession({
      email: 'agent@example.com',
      userId: 'user-1',
    });

    const firstResponse = await POST(
      new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
        body: JSON.stringify({ refreshToken: oldSession.refresh.token }),
        method: 'POST',
      })
    );

    const secondResponse = await POST(
      new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
        body: JSON.stringify({ refreshToken: oldSession.refresh.token }),
        method: 'POST',
      })
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(401);
  });

  it('continues when refresh-token replay protection is unavailable', async () => {
    vi.mocked(getUpstashRestRedisClient).mockResolvedValueOnce(null);

    const oldSession = createCliAppSession({
      email: 'agent@example.com',
      userId: 'user-1',
    });

    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
        body: JSON.stringify({ refreshToken: oldSession.refresh.token }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session.access_token).toMatch(/^ttr_app_/u);
    expect(body.session.refresh_token).toMatch(/^ttr_app_/u);
    expect(body.session.access_token).not.toBe(oldSession.access.token);
    expect(body.session.refresh_token).not.toBe(oldSession.refresh.token);
    expect(consoleWarn).toHaveBeenCalledWith(
      'CLI refresh replay protection unavailable; continuing'
    );
    expect(createAdminClient).toHaveBeenCalled();
  });

  it('fails closed when the guard store owns replay fences and errors', async () => {
    // Assigning the family with no usable store configuration selects `off`.
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    refreshReplaySet.mockRejectedValueOnce(new Error('guard unavailable'));
    const oldSession = createCliAppSession({
      email: 'agent@example.com',
      userId: 'user-1',
    });

    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
        body: JSON.stringify({ refreshToken: oldSession.refresh.token }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('continues when refresh-token replay protection errors', async () => {
    refreshReplaySet.mockRejectedValueOnce(new Error('redis unavailable'));

    const oldSession = createCliAppSession({
      email: 'agent@example.com',
      userId: 'user-1',
    });

    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
        body: JSON.stringify({ refreshToken: oldSession.refresh.token }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session.access_token).toMatch(/^ttr_app_/u);
    expect(body.session.refresh_token).toMatch(/^ttr_app_/u);
    expect(body.session.access_token).not.toBe(oldSession.access.token);
    expect(body.session.refresh_token).not.toBe(oldSession.refresh.token);
    expect(consoleWarn).toHaveBeenCalledWith(
      'CLI refresh replay protection unavailable; continuing'
    );
    expect(createAdminClient).toHaveBeenCalled();
  });
  describe('SR-926 email authority', () => {
    const forgedEmail = 'sr926-forged@attacker.example';

    function mockAuthLookup(
      result:
        | { data: { user: Record<string, unknown> | null }; error: unknown }
        | Error
    ) {
      vi.mocked(createAdminClient).mockResolvedValue({
        auth: {
          admin: {
            getUserById: vi.fn(async () => {
              if (result instanceof Error) throw result;
              return result;
            }),
          },
        },
      } as never);
    }

    async function refreshForged(userId: string) {
      const oldSession = createCliAppSession({ email: forgedEmail, userId });
      return POST(refreshRequest(oldSession.refresh.token));
    }

    it('re-mints a forged-email token with the confirmed Auth email', async () => {
      const response = await refreshForged('user-sr926-a');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain(forgedEmail);
      const access = verifyCliAccessToken(body.session.access_token);
      const refresh = verifyCliRefreshToken(body.session.refresh_token);
      expect(access.ok && access.claims.email).toBe('agent@example.com');
      expect(refresh.ok && refresh.claims.email).toBe('agent@example.com');
    });

    it('carries no email, never the claim, when Auth email is unconfirmed', async () => {
      mockAuthLookup({
        data: {
          user: {
            email: 'agent@example.com',
            email_confirmed_at: null,
            id: 'user-sr926-b',
          },
        },
        error: null,
      });

      const response = await refreshForged('user-sr926-b');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain(forgedEmail);
      const access = verifyCliAccessToken(body.session.access_token);
      expect(access.ok).toBe(true);
      if (access.ok) expect(access.claims.email ?? null).toBeNull();
    });

    it('fails closed with 503 when Auth returns an error', async () => {
      mockAuthLookup({ data: { user: null }, error: { message: 'down' } });

      const response = await refreshForged('user-sr926-c');

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe('AUTH_IDENTITY_UNAVAILABLE');
      expect(body.session).toBeUndefined();
    });

    it('fails closed with 503 when the Auth lookup throws', async () => {
      mockAuthLookup(new Error('network'));

      const response = await refreshForged('user-sr926-d');

      expect(response.status).toBe(503);
      expect((await response.json()).session).toBeUndefined();
    });

    it('refuses a refresh when Auth returns a different subject', async () => {
      mockAuthLookup({
        data: {
          user: {
            email: 'agent@example.com',
            email_confirmed_at: '2026-06-01T00:00:00.000Z',
            id: 'someone-else',
          },
        },
        error: null,
      });

      expect((await refreshForged('user-sr926-e')).status).toBe(401);
    });
  });
});
