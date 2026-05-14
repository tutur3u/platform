import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPOST } from './server';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createDetachedClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
  createDetachedClient: (...args: unknown[]) =>
    mocks.createDetachedClient(...args),
}));

describe('cross-app server verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');

    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            session_data: { email: 'agent@example.com' },
            user_id: 'user-1',
          },
        ],
        error: null,
      }),
    });

    mocks.createAdminClient.mockResolvedValue({
      auth: {
        admin: {
          generateLink: vi.fn().mockResolvedValue({
            data: {
              properties: {
                action_link: 'https://example.com/auth?token=token-hash',
              },
            },
            error: null,
          }),
        },
      },
    });

    mocks.createDetachedClient.mockReturnValue({
      auth: {
        verifyOtp: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'access-token',
              refresh_token: 'refresh-token',
            },
          },
          error: null,
        }),
      },
    });
  });

  it('sets an HttpOnly Tuturuuu app-session cookie without returning Supabase session tokens', async () => {
    const handler = createPOST('learn');

    const response = await handler(
      new NextRequest('https://learn.tuturuuu.com/api/auth/verify-app-token', {
        body: JSON.stringify({ token: 'copy-token' }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      appSessionCreated: true,
      userId: 'user-1',
      valid: true,
    });
    expect(response.headers.get('set-cookie')).toContain(
      'tuturuuu_app_session=ttr_app_'
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createDetachedClient).not.toHaveBeenCalled();
  });

  it('can still create a fresh Supabase session with CLI-designating metadata', async () => {
    const handler = createPOST('platform', {
      sessionKind: 'supabase',
      sessionMetadata: {
        auth_client: 'cli',
        origin: 'TUTURUUU_CLI',
        session_label: 'Tuturuuu CLI',
      },
    });

    await handler(
      new NextRequest('https://tuturuuu.com/api/cli/auth/verify', {
        body: JSON.stringify({ token: 'copy-token' }),
        method: 'POST',
      })
    );

    const adminClient = await mocks.createAdminClient.mock.results[0]?.value;
    expect(adminClient.auth.admin.generateLink).toHaveBeenCalledWith({
      email: 'agent@example.com',
      options: {
        data: {
          auth_client: 'cli',
          origin: 'TUTURUUU_CLI',
          session_label: 'Tuturuuu CLI',
        },
      },
      type: 'magiclink',
    });
  });
});
