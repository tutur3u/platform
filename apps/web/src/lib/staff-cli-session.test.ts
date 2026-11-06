// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ verify: vi.fn(), getUserById: vi.fn() }));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: f.verify,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));

import { isVerifiedStaffCliSession } from './staff-cli-session';

const headers = new Headers({ authorization: 'Bearer ttr_app_synthetic' });
beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockReturnValue({
    ok: true,
    claims: { sub: 'actor', email: 'staff@tuturuuu.com' },
  });
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  ['foreign', 'approved', false],
  ['approved', undefined, false],
  ['approved', 'approved', true],
] as const)(
  'checks current Auth identity %s',
  async (tid, configured, expected) => {
    vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
    f.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'actor',
          email: 'staff@tuturuuu.com',
          email_confirmed_at: '2026-01-01',
          identities: [{ provider: 'azure', identity_data: { tid } }],
        },
      },
      error: null,
    });
    expect(await isVerifiedStaffCliSession(headers)).toBe(expected);
    expect(f.getUserById).toHaveBeenCalledWith('actor');
  }
);
it('denies an invalid CLI signature before identity lookup', async () => {
  f.verify.mockReturnValue({ ok: false });
  expect(await isVerifiedStaffCliSession(headers)).toBe(false);
  expect(f.getUserById).not.toHaveBeenCalled();
});
