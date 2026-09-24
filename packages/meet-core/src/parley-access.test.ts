import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ identity: vi.fn(), member: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mocks.identity } },
  }),
}));
vi.mock('./parley/database', () => ({
  parleyDatabase: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: mocks.member }) }),
      }),
    }),
  }),
}));

import { hasParleyAccess } from './parley-access';

describe('fresh Parley authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.identity.mockResolvedValue({
      data: {
        user: { email: 'user@example.test', email_confirmed_at: '2026-01-01' },
      },
      error: null,
    });
    mocks.member.mockResolvedValue({ data: null, error: null });
  });
  it('requires explicit enablement for external accounts and honors revocation', async () => {
    expect(await hasParleyAccess('user')).toBe(false);
    mocks.member.mockResolvedValue({ data: { enabled: true }, error: null });
    expect(await hasParleyAccess('user')).toBe(true);
    mocks.member.mockResolvedValue({ data: { enabled: false }, error: null });
    expect(await hasParleyAccess('user')).toBe(false);
  });
  it('does not consult the allowlist for a confirmed exact internal domain', async () => {
    mocks.identity.mockResolvedValue({
      data: {
        user: { email: 'user@tuturuuu.com', email_confirmed_at: '2026-01-01' },
      },
      error: null,
    });
    expect(await hasParleyAccess('user')).toBe(true);
    expect(mocks.member).not.toHaveBeenCalled();
  });
  it('rejects unconfirmed identities even with allowlist membership', async () => {
    mocks.identity.mockResolvedValue({
      data: { user: { email: 'user@tuturuuu.com', email_confirmed_at: null } },
      error: null,
    });
    expect(await hasParleyAccess('user')).toBe(false);
  });
  it('fails closed on lookup failure', async () => {
    mocks.member.mockResolvedValue({ data: null, error: { code: 'offline' } });
    await expect(hasParleyAccess('user')).rejects.toThrow(
      'access lookup failed'
    );
  });
});
