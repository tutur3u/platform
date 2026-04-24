import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: (
    ...args: Parameters<typeof mocks.validateAiTempAuthRequest>
  ) => mocks.validateAiTempAuthRequest(...args),
}));

import { resolveAiRouteAuth } from './route-auth.js';

describe('resolveAiRouteAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'session-user-1' } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
  });

  it('uses a valid AI temp token without calling Supabase getUser', async () => {
    mocks.validateAiTempAuthRequest.mockResolvedValue({
      status: 'valid',
      context: {
        user: { id: 'temp-user-1', email: 'temp@example.com' },
        wsId: 'workspace-1',
      },
    });

    const result = await resolveAiRouteAuth(
      new Request('http://localhost/api/ai/chat')
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual(
        expect.objectContaining({ id: 'temp-user-1' })
      );
      expect(result.tempAuthContext?.wsId).toBe('workspace-1');
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('rejects a revoked AI temp token without falling back to getUser', async () => {
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'revoked' });

    const result = await resolveAiRouteAuth(
      new Request('http://localhost/api/ai/chat')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('falls back to Supabase auth when temp auth is missing', async () => {
    const result = await resolveAiRouteAuth(
      new Request('http://localhost/api/ai/chat')
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('session-user-1');
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when both temp auth and Supabase session auth fail', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('missing session'),
    });

    const result = await resolveAiRouteAuth(
      new Request('http://localhost/api/ai/chat')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
