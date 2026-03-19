import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProxyOnlyPublicTableError } from '../protected-tables';
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
  const mockUserSchemaFrom = vi.fn((table: string) => ({
    client: 'user',
    schema: 'public',
    table,
  }));
  const mockAdminSchemaFrom = vi.fn((table: string) => ({
    client: 'admin',
    schema: 'public',
    table,
  }));
  const mockUserClient = {
    from: vi.fn((table: string) => ({ client: 'user', table })),
    schema: vi.fn(() => ({
      from: mockUserSchemaFrom,
    })),
    auth: {
      getUser: vi.fn(),
    },
  };
  const mockAdminClient = {
    from: vi.fn((table: string) => ({ client: 'admin', table })),
    schema: vi.fn(() => ({
      from: mockAdminSchemaFrom,
    })),
    auth: {
      getUser: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (cookies as any).mockReturnValue(mockCookieStore);
    (createServerClient as any).mockImplementation(
      (_url: string, key: string) =>
        key === 'test-secret-key' ? mockAdminClient : mockUserClient
    );
    (createBrowserClient as any).mockImplementation(
      (_url: string, key: string) =>
        key === 'test-secret-key' ? mockAdminClient : mockUserClient
    );
  });

  describe('createClient', () => {
    it('should create a regular client with cookie handling', async () => {
      const client = await createClient();

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
      expect(() => client.from('mira_accessories')).toThrow(
        getProxyOnlyPublicTableError('mira_accessories')
      );
      expect(() => client.from('workspace_boards')).toThrow(
        getProxyOnlyPublicTableError('workspace_boards')
      );
    });

    it('should create a Bearer-token client when request has Authorization header', async () => {
      const mockRequest = {
        headers: new Headers({
          Authorization: 'Bearer test-access-token',
        }),
      };

      const client = await createClient(mockRequest);

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
      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-secret-key',
        expect.objectContaining({
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        })
      );

      expect(client.from('mira_accessories')).toEqual({
        client: 'admin',
        table: 'mira_accessories',
      });
      expect(client.from('workspace_calendars')).toEqual({
        client: 'admin',
        table: 'workspace_calendars',
      });
      expect(client.from('workspace_boards')).toEqual({
        client: 'admin',
        table: 'workspace_boards',
      });
      expect(client.from('users')).toEqual({ client: 'user', table: 'users' });
      expect(client.schema('public').from('mira_accessories')).toEqual({
        client: 'admin',
        schema: 'public',
        table: 'mira_accessories',
      });
    });

    it('should fall back to cookie auth when request has no Bearer token', async () => {
      const mockRequest = {
        headers: new Headers({}),
      };

      const client = await createClient(mockRequest);

      expect(createServerClient).toHaveBeenCalled();
      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-secret-key',
        expect.objectContaining({
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        })
      );

      expect(client.from('mira_accessories')).toEqual({
        client: 'admin',
        table: 'mira_accessories',
      });
      expect(client.from('workspace_boards')).toEqual({
        client: 'admin',
        table: 'workspace_boards',
      });
      expect(client.from('users')).toEqual({ client: 'user', table: 'users' });
      expect(client.schema('public').from('mira_accessories')).toEqual({
        client: 'admin',
        schema: 'public',
        table: 'mira_accessories',
      });
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
      const client = await createDynamicClient();

      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-publishable-key',
        expect.objectContaining({
          cookies: expect.any(Object),
        })
      );
      expect(() => client.from('workspace_calendars')).toThrow(
        getProxyOnlyPublicTableError('workspace_calendars')
      );
      expect(() => client.from('workspace_boards')).toThrow(
        getProxyOnlyPublicTableError('workspace_boards')
      );
      expect(() => client.from('mira_accessories')).toThrow(
        getProxyOnlyPublicTableError('mira_accessories')
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
