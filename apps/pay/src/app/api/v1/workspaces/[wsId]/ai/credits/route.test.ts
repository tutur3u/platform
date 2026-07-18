import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AiCreditsStatusError extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message);
    }
  }

  return {
    AiCreditsStatusError,
    createAdminClient: vi.fn(),
    getAiCreditsStatus: vi.fn(),
    getAppSessionUserFromRequest: vi.fn(),
  };
});

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionUserFromRequest: mocks.getAppSessionUserFromRequest,
}));
vi.mock('@tuturuuu/payment-core', () => ({
  AiCreditsStatusError: mocks.AiCreditsStatusError,
  getAiCreditsStatus: mocks.getAiCreditsStatus,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET } from './route';

const context = { params: Promise.resolve({ wsId: 'ws-1' }) };

describe('GET Pay workspace AI credits', () => {
  beforeEach(() => {
    mocks.getAppSessionUserFromRequest.mockReturnValue({ id: 'user-1' });
    mocks.createAdminClient.mockResolvedValue({ id: 'admin' });
    mocks.getAiCreditsStatus.mockResolvedValue({
      remaining: 850,
      tier: 'FREE',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('accepts Pay and Platform app sessions', async () => {
    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(200);
    expect(mocks.getAppSessionUserFromRequest).toHaveBeenCalledWith(
      expect.any(Request),
      { targetApp: ['pay', 'platform'] }
    );
    expect(mocks.getAiCreditsStatus).toHaveBeenCalledWith({
      accessClient: { id: 'admin' },
      userId: 'user-1',
      wsId: 'ws-1',
    });
    expect(response.headers.get('cache-control')).toBe('private, max-age=30');
    expect(await response.json()).toEqual({ remaining: 850, tier: 'FREE' });
  });

  it('returns 401 without a verified app session', async () => {
    mocks.getAppSessionUserFromRequest.mockReturnValue(null);

    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.getAiCreditsStatus).not.toHaveBeenCalled();
  });

  it('preserves service authorization errors', async () => {
    mocks.getAiCreditsStatus.mockRejectedValue(
      new mocks.AiCreditsStatusError('Workspace access denied', 403)
    );

    const response = await GET(new Request('https://pay.test'), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Workspace access denied',
    });
  });
});
