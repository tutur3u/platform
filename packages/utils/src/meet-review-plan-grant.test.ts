import { afterEach, expect, it, vi } from 'vitest';

const createAdminClient = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient }));

import { canVerifiedAccountHostMeeting } from './meet-hosting';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it('requires a confirmed personal account and rechecks its effective tier after revocation', async () => {
  vi.stubEnv('MEET_PAID_TIER_HOSTING_ENABLED', 'true');
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'personal-ws' } }),
  };
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: 'PLUS' })
    .mockResolvedValueOnce({ data: 'FREE' });
  createAdminClient.mockResolvedValue({ from: vi.fn(() => query), rpc });
  const identity = {
    email: 'review@example.com',
    email_confirmed_at: '2026-01-01',
    identities: [{ provider: 'email', identity_data: {} }],
  };
  expect(await canVerifiedAccountHostMeeting('reviewer', identity)).toBe(true);
  expect(await canVerifiedAccountHostMeeting('reviewer', identity)).toBe(false);
  expect(await canVerifiedAccountHostMeeting('reviewer', null)).toBe(false);
  expect(query.eq).toHaveBeenCalledWith('creator_id', 'reviewer');
  expect(query.eq).toHaveBeenCalledWith('personal', true);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenCalledWith('_resolve_workspace_tier', {
    p_ws_id: 'personal-ws',
  });
});
