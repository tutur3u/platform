import { afterEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ getUserById: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));

import { isVerifiedStaff } from './staff-access';

afterEach(() => vi.unstubAllEnvs());
it.each([
  ['foreign', 'approved', false],
  ['approved', undefined, false],
  ['approved', 'approved', true],
] as const)(
  'verifies current provider identity %s',
  async (tid, configured, expected) => {
    vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
    f.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'actor',
          email: 'artist@tuturuuu.com',
          email_confirmed_at: '2026-01-01',
          identities: [{ provider: 'azure', identity_data: { tid } }],
        },
      },
      error: null,
    });
    expect(await isVerifiedStaff('actor')).toBe(expected);
  }
);

it('denies confirmed xwf accounts', async () => {
  f.getUserById.mockResolvedValue({
    data: {
      user: {
        id: 'actor',
        email: 'artist@xwf.tuturuuu.com',
        email_confirmed_at: '2026-01-01',
        identities: [{ provider: 'email', identity_data: {} }],
      },
    },
    error: null,
  });
  expect(await isVerifiedStaff('actor')).toBe(false);
});
