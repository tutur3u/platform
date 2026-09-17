import { createBrowserClient } from '@supabase/ssr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({})),
  createServerClient: vi.fn(),
}));
vi.mock('../common', () => ({
  checkEnvVariables: () => ({
    url: 'https://example.supabase.co',
    key: 'test-service-key',
  }),
}));

import { createAdminClient } from '../server';

describe('trusted audit actor admin clients', () => {
  beforeEach(() => vi.clearAllMocks());
  it('isolates actor headers between clients and disables persisted sessions', () => {
    const first = '00000000-0000-4000-8000-000000000001';
    const second = '00000000-0000-4000-8000-000000000002';
    createAdminClient({ auditActorId: first });
    createAdminClient({ auditActorId: second });
    expect(createBrowserClient).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        isSingleton: false,
        global: { headers: { 'x-ttr-audit-actor-id': first } },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    );
    expect(createBrowserClient).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        global: { headers: { 'x-ttr-audit-actor-id': second } },
      })
    );
  });
  it('rejects invalid actor ids before constructing a privileged client', () => {
    expect(() => createAdminClient({ auditActorId: 'not-an-id' })).toThrow(
      'Invalid audit actor id'
    );
    expect(createBrowserClient).not.toHaveBeenCalled();
  });
});
