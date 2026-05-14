import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPOST } from './server';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
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
    expect(response.headers.get('set-cookie')).not.toContain('Domain=');
  });

  it('returns Tuturuuu-managed app-session JWTs for CLI token exchange', async () => {
    const handler = createPOST('platform', {
      sessionKind: 'cli-app-session',
    });

    const response = await handler(
      new NextRequest('https://tuturuuu.com/api/cli/auth/verify', {
        body: JSON.stringify({ token: 'copy-token' }),
        method: 'POST',
      })
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      email: 'agent@example.com',
      session: {
        token_type: 'bearer',
      },
      sessionCreated: true,
      userId: 'user-1',
      valid: true,
    });
    expect(body.session.access_token).toMatch(/^ttr_app_/u);
    expect(body.session.refresh_token).toMatch(/^ttr_app_/u);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
