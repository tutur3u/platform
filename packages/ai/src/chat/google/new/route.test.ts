import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cascadeBackendRateLimitToProxyBan: vi.fn(),
  createClient: vi.fn(),
  extractIPFromHeaders: vi.fn(),
  generateText: vi.fn(),
  google: vi.fn(),
  isBackendRateLimitError: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('ai', () => ({
  generateText: (...args: Parameters<typeof mocks.generateText>) =>
    mocks.generateText(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: (
    ...args: Parameters<typeof mocks.extractIPFromHeaders>
  ) => mocks.extractIPFromHeaders(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  cascadeBackendRateLimitToProxyBan: (
    ...args: Parameters<typeof mocks.cascadeBackendRateLimitToProxyBan>
  ) => mocks.cascadeBackendRateLimitToProxyBan(...args),
  isBackendRateLimitError: (
    ...args: Parameters<typeof mocks.isBackendRateLimitError>
  ) => mocks.isBackendRateLimitError(...args),
}));

import { createPOST } from './route';

describe('chat google new route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractIPFromHeaders.mockReturnValue('203.0.113.10');
    mocks.cascadeBackendRateLimitToProxyBan.mockResolvedValue({
      id: 'block-1',
      blockLevel: 1,
      reason: 'api_abuse',
      blockedAt: new Date(),
      expiresAt: new Date(Date.now() + 300_000),
    });
    mocks.google.mockReturnValue('mock-model');
    mocks.generateText.mockResolvedValue({ text: 'New title' });
    mocks.isBackendRateLimitError.mockReturnValue(false);
  });

  it('returns 429 and seeds the proxy ban cache when auth is rate limited', async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { status: 429, code: 'over_request_rate_limit' },
        }),
      },
    });
    mocks.isBackendRateLimitError.mockImplementation(
      (error) => error?.status === 429
    );

    const response = await createPOST()(
      new Request('http://localhost/api/ai/chat/new', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );

    expect(response.status).toBe(429);
    expect(mocks.cascadeBackendRateLimitToProxyBan).toHaveBeenCalledWith({
      endpoint: '/api/ai/chat/new',
      ipAddress: '203.0.113.10',
      source: 'auth',
      userId: undefined,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('auto-suspends the verified user when the database returns 429', async () => {
    const insert = vi.fn().mockResolvedValue({
      data: null,
      error: { status: 429, message: 'Request rate limit reached' },
    });

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: insert,
          }),
        }),
      }),
    });
    mocks.isBackendRateLimitError.mockImplementation(
      (error) => error?.status === 429
    );

    const response = await createPOST()(
      new Request('http://localhost/api/ai/chat/new', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );

    expect(response.status).toBe(429);
    expect(mocks.cascadeBackendRateLimitToProxyBan).toHaveBeenCalledWith({
      endpoint: '/api/ai/chat/new',
      ipAddress: '203.0.113.10',
      source: 'database',
      userId: 'user-1',
    });
  });
});
