import { SHOW_VERSION_BADGE_CONFIG_ID } from '@tuturuuu/internal-api/users';
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

  it('deletes the current user config when the value is null', async () => {
    const route = await import(
      '@/app/api/v1/users/me/configs/[configId]/route'
    );
    const query = {
      delete: vi.fn(() => query),
      eq: vi.fn(() => query),
      error: null,
    };
    const from = vi.fn(() => query);
    const response = await (route.PUT as any)(
      new NextRequest('http://localhost/api/v1/users/me/configs/test', {
        method: 'PUT',
        body: JSON.stringify({ value: null }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        user: { id: 'user-1' },
        supabase: { from },
      },
      { configId: 'test' }
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('user_configs');
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'test');
  });

  it('hides the version badge config from non-exact Tuturuuu users', async () => {
    const route = await import(
      '@/app/api/v1/users/me/configs/[configId]/route'
    );
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: { value: 'true' },
        error: null,
      })),
      select: vi.fn(() => query),
    };
    const from = vi.fn(() => query);
    const response = await (route.GET as any)(
      new NextRequest(
        `http://localhost/api/v1/users/me/configs/${SHOW_VERSION_BADGE_CONFIG_ID}`
      ),
      {
        user: { id: 'user-1', email: 'member@example.com' },
        supabase: { from },
      },
      { configId: SHOW_VERSION_BADGE_CONFIG_ID }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ value: null });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns the version badge config for exact Tuturuuu users', async () => {
    const route = await import(
      '@/app/api/v1/users/me/configs/[configId]/route'
    );
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: { value: 'true' },
        error: null,
      })),
      select: vi.fn(() => query),
    };
    const from = vi.fn(() => query);
    const response = await (route.GET as any)(
      new NextRequest(
        `http://localhost/api/v1/users/me/configs/${SHOW_VERSION_BADGE_CONFIG_ID}`
      ),
      {
        user: { id: 'user-1', email: 'member@tuturuuu.com' },
        supabase: { from },
      },
      { configId: SHOW_VERSION_BADGE_CONFIG_ID }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ value: 'true' });
    expect(from).toHaveBeenCalledWith('user_configs');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('id', SHOW_VERSION_BADGE_CONFIG_ID);
  });

  it('rejects version badge opt-in writes from xwf subdomain users', async () => {
    const route = await import(
      '@/app/api/v1/users/me/configs/[configId]/route'
    );
    const from = vi.fn();
    const response = await (route.PUT as any)(
      new NextRequest(
        `http://localhost/api/v1/users/me/configs/${SHOW_VERSION_BADGE_CONFIG_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({ value: 'true' }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        user: { id: 'user-1', email: 'member@xwf.tuturuuu.com' },
        supabase: { from },
      },
      { configId: SHOW_VERSION_BADGE_CONFIG_ID }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Version badge is limited to @tuturuuu.com accounts',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('allows non-exact users to clear the version badge config', async () => {
    const route = await import(
      '@/app/api/v1/users/me/configs/[configId]/route'
    );
    const query = {
      delete: vi.fn(() => query),
      eq: vi.fn(() => query),
      error: null,
    };
    const from = vi.fn(() => query);
    const response = await (route.PUT as any)(
      new NextRequest(
        `http://localhost/api/v1/users/me/configs/${SHOW_VERSION_BADGE_CONFIG_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({ value: null }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        user: { id: 'user-1', email: 'member@xwf.tuturuuu.com' },
        supabase: { from },
      },
      { configId: SHOW_VERSION_BADGE_CONFIG_ID }
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('user_configs');
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('id', SHOW_VERSION_BADGE_CONFIG_ID);
  });

  it('allows exact Tuturuuu users to enable the version badge config', async () => {
    const route = await import(
      '@/app/api/v1/users/me/configs/[configId]/route'
    );
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    const response = await (route.PUT as any)(
      new NextRequest(
        `http://localhost/api/v1/users/me/configs/${SHOW_VERSION_BADGE_CONFIG_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({ value: 'true' }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        user: { id: 'user-1', email: 'member@tuturuuu.com' },
        supabase: { from },
      },
      { configId: SHOW_VERSION_BADGE_CONFIG_ID }
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('user_configs');
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: SHOW_VERSION_BADGE_CONFIG_ID,
          user_id: 'user-1',
          value: 'true',
        }),
      ],
      { onConflict: 'user_id,id' }
    );
  });
});
