import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminClient,
  createClient,
  createDynamicClient,
} from '../server';

// Mock dependencies
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('../common', () => ({
  checkEnvVariables: ({ useServiceKey }: { useServiceKey: boolean }) => ({
    url: 'https://test.supabase.co',
    key: useServiceKey ? 'admin-key' : 'anon-key',
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
    (cookies as unknown as MockedFunction<typeof cookies>).mockReturnValue(
      mockCookieStore
    );
  });

  describe('createClient', () => {
    it('should create a regular client with cookie handling', async () => {
      await createClient();

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'anon-key',
        expect.objectContaining({
          cookies: expect.any(Object),
        })
      );

      // Verify cookie handler was created correctly
      const cookieHandler = (
        createServerClient as MockedFunction<typeof createServerClient>
      ).mock.calls[0][2].cookies;
      expect(cookieHandler.getAll()).toEqual([
        { name: 'test-cookie', value: 'test-value' },
      ]);
    });
  });

  describe('createAdminClient', () => {
    it('should create an admin client with no-op cookie handling', async () => {
      await createAdminClient();

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'admin-key',
        expect.objectContaining({
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          }),
        })
      );

      // Verify admin client uses no-op cookie handler
      const cookieHandler = (
        createServerClient as MockedFunction<typeof createServerClient>
      ).mock.calls[0][2].cookies;
      expect(cookieHandler.getAll()).toEqual([]);
    });
  });

  describe('createDynamicClient', () => {
    it('should create a dynamic client with cookie handling', async () => {
      await createDynamicClient();

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'anon-key',
        expect.objectContaining({
          cookies: expect.any(Object),
        })
      );
    });
  });
});
