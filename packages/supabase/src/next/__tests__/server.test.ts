import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminClient,
  createAnonClient,
  createClient,
  createDynamicAdminClient,
  createDynamicClient,
} from '../server';

// Mock dependencies
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
  createBrowserClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('../common', () => ({
  checkEnvVariables: ({ useSecretKey }: { useSecretKey: boolean }) => ({
    url: 'https://test.supabase.co',
    key: useSecretKey ? 'test-secret-key' : 'test-publishable-key',
  }),
}));

describe('Supabase Server Client', () => {
  const mockCookieStore = {
    getAll: vi
      .fn()
      .mockReturnValue([{ name: 'test-cookie', value: 'test-value' }]),
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (cookies as any).mockReturnValue(mockCookieStore);
  });

  describe('createClient', () => {
    it('should create a regular client with cookie handling', async () => {
      await createClient();

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-publishable-key',
        expect.objectContaining({
          cookies: expect.any(Object),
        })
      );

      // Verify cookie handler was created correctly
      const cookieHandler = (createServerClient as any).mock.calls[0][2]
        .cookies;
      expect(cookieHandler.getAll()).toEqual([
        { name: 'test-cookie', value: 'test-value' },
      ]);
    });

    it('should create a Bearer-token client when request has Authorization header', async () => {
      const mockRequest = {
        headers: new Headers({
          Authorization: 'Bearer test-access-token',
        }),
      };

      await createClient(mockRequest);

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-publishable-key',
        expect.objectContaining({
          global: {
            headers: {
              Authorization: 'Bearer test-access-token',
            },
          },
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        })
      );
      // Should NOT fall back to cookie-based client.
      expect(createServerClient).not.toHaveBeenCalled();
    });

    it('should fall back to cookie auth when request has no Bearer token', async () => {
      const mockRequest = {
        headers: new Headers({}),
      };

      await createClient(mockRequest);

      // No Bearer token → falls back to cookie-based createServerClient.
      expect(createServerClient).toHaveBeenCalled();
      expect(createBrowserClient).not.toHaveBeenCalled();
    });
  });

  describe('createAdminClient', () => {
    it('should create an admin client with no-op cookie handling', async () => {
      await createAdminClient();

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-secret-key',
        expect.objectContaining({
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          }),
        })
      );

      // Verify admin client uses no-op cookie handler
      const cookieHandler = (createServerClient as any).mock.calls[0][2]
        .cookies;
      expect(cookieHandler.getAll()).toEqual([]);
    });

    it('should create a browser admin client when noCookie is true', () => {
      createAdminClient({ noCookie: true });

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-secret-key'
      );
      expect(createServerClient).not.toHaveBeenCalled();
    });
  });

  describe('createDynamicClient', () => {
    it('should create a dynamic client with cookie handling', async () => {
      await createDynamicClient();

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-publishable-key',
        expect.objectContaining({
          cookies: expect.any(Object),
        })
      );
    });
  });

  describe('createAnonClient', () => {
    it('should create an anonymous client without session persistence', () => {
      createAnonClient();

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-publishable-key',
        expect.objectContaining({
          global: {
            headers: {
              Authorization: 'Bearer test-publishable-key',
            },
          },
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        })
      );
    });

    it('should use publishable key for authorization header', () => {
      createAnonClient();

      const callArgs = (createBrowserClient as any).mock.calls[0];
      expect(callArgs[2].global.headers.Authorization).toBe(
        'Bearer test-publishable-key'
      );
    });
  });

  describe('createDynamicAdminClient', () => {
    it('should create a dynamic admin client with no-op cookie handling', async () => {
      await createDynamicAdminClient();

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-secret-key',
        expect.objectContaining({
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          }),
        })
      );

      // Verify admin client uses no-op cookie handler
      const cookieHandler = (createServerClient as any).mock.calls[0][2]
        .cookies;
      expect(cookieHandler.getAll()).toEqual([]);
    });

    it('should not modify cookies', async () => {
      await createDynamicAdminClient();

      const cookieHandler = (createServerClient as any).mock.calls[0][2]
        .cookies;

      // setAll should be a no-op
      const result = cookieHandler.setAll([
        { name: 'test', value: 'test', options: {} },
      ]);
      expect(result).toBeUndefined();
    });
  });
});
