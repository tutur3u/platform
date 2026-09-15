import { beforeEach, expect, it, vi } from 'vitest';

const tier = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('./meet-duration', () => ({ getHostMeetingTier: tier }));

import { canVerifiedAccountHostMeeting } from './meet-hosting';

beforeEach(() => {
  vi.resetAllMocks();
  tier.mockResolvedValue('FREE');
});
it.each(['PLUS', 'PRO', 'ENTERPRISE'])(
  'unlocks verified %s accounts',
  async (value) => {
    tier.mockResolvedValue(value);
    expect(
      await canVerifiedAccountHostMeeting('actor', {
        email: 'host@example.com',
        email_confirmed_at: '2026-01-01',
      })
    ).toBe(true);
    expect(tier).toHaveBeenCalledWith('actor');
  }
);
it('requires verification before considering a paid subscription', async () => {
  tier.mockResolvedValue('PLUS');
  expect(
    await canVerifiedAccountHostMeeting('actor', { email: 'host@example.com' })
  ).toBe(false);
  expect(tier).not.toHaveBeenCalled();
});
it('preserves verified company hosting without paid entitlement', async () => {
  expect(
    await canVerifiedAccountHostMeeting('actor', {
      email: 'host@tuturuuu.com',
      email_confirmed_at: '2026-01-01',
    })
  ).toBe(true);
  expect(tier).not.toHaveBeenCalled();
});
it('denies external Free accounts', async () => {
  expect(
    await canVerifiedAccountHostMeeting('actor', {
      email: 'host@example.com',
      email_confirmed_at: '2026-01-01',
    })
  ).toBe(false);
});
it('fails closed when entitlement cannot be resolved', async () => {
  tier.mockRejectedValue(new Error('Unavailable'));
  await expect(
    canVerifiedAccountHostMeeting('actor', {
      email: 'host@example.com',
      email_confirmed_at: '2026-01-01',
    })
  ).rejects.toThrow('Unavailable');
});
