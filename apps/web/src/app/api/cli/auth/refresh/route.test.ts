import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
}));

describe('CLI auth refresh route', () => {
  let refreshReplaySet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    refreshReplaySet = vi.fn().mockResolvedValue('OK');
    vi.mocked(getUpstashRestRedisClient).mockResolvedValue({
      set: refreshReplaySet,
    } as never);
    vi.mocked(createAdminClient).mockResolvedValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                email: 'agent@example.com',
                id: 'user-1',
              },
            },
            error: null,
          }),
        },
      },
    } as never);
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

  it('fails closed when refresh-token replay protection is unavailable', async () => {
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

    expect(response.status).toBe(503);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('fails closed when refresh-token replay protection errors', async () => {
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

    expect(response.status).toBe(503);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
