import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

describe('CLI auth refresh route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
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
});
