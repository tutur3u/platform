import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

describe('user config route payload protection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 413 before schema validation for oversized bodies', async () => {
    const route = await import(
      '@/app/api/v1/users/me/configs/[configId]/route'
    );
    const response = await (route.PUT as any)(
      new NextRequest('http://localhost/api/v1/users/me/configs/test', {
        method: 'PUT',
        body: JSON.stringify({ value: 'x'.repeat(600 * 1024) }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        user: { id: 'user-1' },
        supabase: { from: vi.fn() },
      },
      { configId: 'test' }
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Payload Too Large',
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('keeps returning 400 for schema violations within the byte limit', async () => {
    const route = await import(
      '@/app/api/v1/users/me/configs/[configId]/route'
    );
    const response = await (route.PUT as any)(
      new NextRequest('http://localhost/api/v1/users/me/configs/test', {
        method: 'PUT',
        body: JSON.stringify({ value: 'x'.repeat(1500) }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        user: { id: 'user-1' },
        supabase: { from: vi.fn() },
      },
      { configId: 'test' }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invalid request data',
    });
  });
});
