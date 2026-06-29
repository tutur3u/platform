import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handlePostEmailQueueCronMock, requireRootAdminMock } = vi.hoisted(
  () => ({
    handlePostEmailQueueCronMock: vi.fn(),
    requireRootAdminMock: vi.fn(),
  })
);

vi.mock('@/app/api/cron/process-post-email-queue/route', () => ({
  handlePostEmailQueueCron: handlePostEmailQueueCronMock,
}));

vi.mock('../auth', () => ({
  requirePostEmailQueueRootAdmin: requireRootAdminMock,
}));

import { POST } from './route';

describe('post email queue run-now route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'server-cron-secret');
    vi.stubEnv('VERCEL_CRON_SECRET', '');
    requireRootAdminMock.mockResolvedValue({ user: { id: 'root-user' } });
    handlePostEmailQueueCronMock.mockResolvedValue(
      NextResponse.json({
        claimed: 1,
        ok: true,
        processed: 1,
      })
    );
  });

  it('uses the server cron secret and clamps operator-provided limits', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/infrastructure/post-email-queue/run-now',
        {
          body: JSON.stringify({ limit: 9999, sendLimit: 9999 }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(200);
    expect(handlePostEmailQueueCronMock).toHaveBeenCalledTimes(1);
    const cronRequest = handlePostEmailQueueCronMock.mock.calls[0]?.[0];
    expect(cronRequest.headers.get('Authorization')).toBe(
      'Bearer server-cron-secret'
    );
    expect(cronRequest.nextUrl.searchParams.get('limit')).toBe('500');
    expect(cronRequest.nextUrl.searchParams.get('sendLimit')).toBe('200');
    expect(cronRequest.nextUrl.searchParams.get('debug')).toBe('1');
  });
});
