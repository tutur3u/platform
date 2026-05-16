import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

describe('central cross-app token verification route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            session_data: { email: 'learn@example.com' },
            user_id: 'user-1',
          },
        ],
        error: null,
      }),
    });
  });

  it('validates a Learn token against the central Web Supabase project', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/cross-app-token/verify', {
        body: JSON.stringify({
          targetApp: 'learn',
          token: 'learn-token',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();

    expect(body).toMatchObject({
      appSessionExpiresAt: expect.any(String),
      sessionData: { email: 'learn@example.com' },
      userId: 'user-1',
      valid: true,
    });
    expect(body.appSessionToken).toMatch(/^ttr_app_/u);

    const supabase = await mocks.createClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith(
      'validate_cross_app_token_with_session',
      {
        p_target_app: 'learn',
        p_token: 'learn-token',
      }
    );
  });

  it('rejects unregistered target apps', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/cross-app-token/verify', {
        body: JSON.stringify({
          targetApp: 'unknown-app',
          token: 'learn-token',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
