import { createBrowserClient } from '@supabase/ssr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthClient } from '../auth-browser';
import { __resetBrowserClientCacheForTests } from '../browser-base';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
}));

vi.mock('../common', () => ({
  checkEnvVariables: () => ({
    key: 'test-key',
    url: 'https://test.supabase.co',
  }),
}));

describe('auth browser client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetBrowserClientCacheForTests();
    (createBrowserClient as any).mockReturnValue({
      auth: {},
    });
  });

  it('enables Supabase experimental passkey APIs', () => {
    createAuthClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      {
        auth: {
          experimental: {
            passkey: true,
          },
        },
      }
    );
  });
});
