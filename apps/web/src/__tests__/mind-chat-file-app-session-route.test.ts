import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withSessionAuth: vi.fn((handler: unknown, _options: unknown) => handler),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options?: unknown) =>
    mocks.withSessionAuth(handler, options),
}));

describe('Mind chat file routes', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.withSessionAuth.mockClear();
  });

  it.each<[string, () => Promise<unknown>, Record<string, unknown>]>([
    [
      'upload-url',
      () => import('@/app/api/ai/chat/upload-url/route'),
      {
        allowAiTempAuth: true,
        allowAppSessionAuth: { targetApp: 'mind' },
        rateLimit: { windowMs: 60000, maxRequests: 60 },
      },
    ],
    [
      'delete-file',
      () => import('@/app/api/ai/chat/delete-file/route'),
      {
        allowAiTempAuth: true,
        allowAppSessionAuth: { targetApp: 'mind' },
        rateLimit: { windowMs: 60000, maxRequests: 120 },
      },
    ],
    [
      'file-urls',
      () => import('@/app/api/ai/chat/file-urls/route'),
      {
        allowAiTempAuth: true,
        allowAppSessionAuth: { targetApp: 'mind' },
        rateLimitKind: 'read',
      },
    ],
  ])('accepts Mind app-session auth for %s', async (_, loadRoute, expectedOptions) => {
    await loadRoute();

    expect(mocks.withSessionAuth).toHaveBeenCalledWith(
      expect.any(Function),
      expectedOptions
    );
  });
});
