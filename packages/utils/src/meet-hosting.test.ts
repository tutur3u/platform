import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tier = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('./meet-duration', () => ({ getHostMeetingTier: tier }));

import {
  canVerifiedAccountHostMeeting,
  isMeetPaidTierHostingEnabled,
} from './meet-hosting';

const external = {
  email: 'host@example.com',
  email_confirmed_at: '2026-01-01',
  identities: [{ provider: 'email', identity_data: {} }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('MEET_PAID_TIER_HOSTING_ENABLED', 'true');
  tier.mockResolvedValue('FREE');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('paid-tier hosting flag', () => {
  it.each([
    '',
    ' ',
    'false',
    '0',
    '1',
    'TRUE',
    'True',
    ' true',
    'true ',
    'yes',
    'on',
  ])('fails closed for %j', (value) => {
    expect(isMeetPaidTierHostingEnabled(value)).toBe(false);
  });
  it('enables only for the exact value true', () => {
    expect(isMeetPaidTierHostingEnabled('true')).toBe(true);
  });
  it.each([undefined, '', 'false', 'TRUE'])(
    'reads env %j as OFF by default',
    (value) => {
      vi.stubEnv('MEET_PAID_TIER_HOSTING_ENABLED', value);
      expect(isMeetPaidTierHostingEnabled()).toBe(false);
    }
  );
});

it.each(['PLUS', 'PRO', 'ENTERPRISE'])(
  'denies verified external %s accounts while the flag is off',
  async (value) => {
    vi.stubEnv('MEET_PAID_TIER_HOSTING_ENABLED', undefined);
    tier.mockResolvedValue(value);
    expect(await canVerifiedAccountHostMeeting('actor', external)).toBe(false);
    expect(tier).not.toHaveBeenCalled();
  }
);
it('denies paid external accounts for a non-exact flag value', async () => {
  vi.stubEnv('MEET_PAID_TIER_HOSTING_ENABLED', '1');
  tier.mockResolvedValue('PRO');
  expect(await canVerifiedAccountHostMeeting('actor', external)).toBe(false);
});
it('allows verified internal hosts while the flag is off', async () => {
  vi.stubEnv('MEET_PAID_TIER_HOSTING_ENABLED', undefined);
  expect(
    await canVerifiedAccountHostMeeting('actor', {
      ...external,
      email: 'host@tuturuuu.com',
    })
  ).toBe(true);
  expect(tier).not.toHaveBeenCalled();
});
it.each([undefined, 'true'])(
  'always denies external Free accounts (flag %j)',
  async (flag) => {
    vi.stubEnv('MEET_PAID_TIER_HOSTING_ENABLED', flag);
    expect(await canVerifiedAccountHostMeeting('actor', external)).toBe(false);
  }
);
it.each(['PLUS', 'PRO', 'ENTERPRISE'])(
  'unlocks verified %s accounts when the flag is on',
  async (value) => {
    tier.mockResolvedValue(value);
    expect(
      await canVerifiedAccountHostMeeting('actor', {
        email: 'host@example.com',
        email_confirmed_at: '2026-01-01',
        identities: [{ provider: 'email', identity_data: {} }],
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
      identities: [{ provider: 'email', identity_data: {} }],
    })
  ).toBe(true);
  expect(tier).not.toHaveBeenCalled();
});
it('denies external Free accounts', async () => {
  expect(
    await canVerifiedAccountHostMeeting('actor', {
      email: 'host@example.com',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'email', identity_data: {} }],
    })
  ).toBe(false);
});
it('fails closed when entitlement cannot be resolved', async () => {
  tier.mockRejectedValue(new Error('Unavailable'));
  await expect(
    canVerifiedAccountHostMeeting('actor', {
      email: 'host@example.com',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'email', identity_data: {} }],
    })
  ).rejects.toThrow('Unavailable');
});

it('does not grant Free hosting from a foreign staff identity', async () => {
  vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', 'approved');
  expect(
    await canVerifiedAccountHostMeeting('actor', {
      email: 'host@tuturuuu.com',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'azure', identity_data: { tid: 'foreign' } }],
    })
  ).toBe(false);
});

it('does not grant company hosting to xwf accounts', async () => {
  expect(
    await canVerifiedAccountHostMeeting('actor', {
      email: 'host@xwf.tuturuuu.com',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'email', identity_data: {} }],
    })
  ).toBe(false);
});
