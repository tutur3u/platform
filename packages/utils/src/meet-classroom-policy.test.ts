import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const fixtures = vi.hoisted(() => ({
  tier: vi.fn(),
  admin: vi.fn(),
  identity: vi.fn(),
  meeting: vi.fn(),
}));
vi.mock('@tuturuuu/utils/meet-duration', () => ({
  getHostMeetingTier: fixtures.tier,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: fixtures.admin,
}));
import {
  classroomParticipantCap,
  getClassroomParticipantCap,
} from './meet-classroom-policy';
const host = '11111111-1111-4111-8111-111111111111';
function setup(tier = 'FREE', email = 'teacher@tuturuuu.com') {
  vi.stubEnv('MEET_CLASSROOM_LIMITS_ENABLED', 'true');
  fixtures.tier.mockResolvedValue(tier);
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: fixtures.meeting,
  };
  fixtures.meeting.mockResolvedValue({
    data: { creator_id: host },
    error: null,
  });
  fixtures.identity.mockResolvedValue({
    data: {
      user: {
        id: host,
        email,
        email_confirmed_at: '2026-01-01',
        identities: [{ provider: 'email' }],
      },
    },
    error: null,
  });
  fixtures.admin.mockResolvedValue({
    from: () => query,
    auth: { admin: { getUserById: fixtures.identity } },
  });
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([
  ['FREE', 10],
  ['PLUS', 50],
  ['PRO', 50],
  ['ENTERPRISE', 100],
])('maps %s to the confirmed participant cap', (tier, cap) =>
  expect(classroomParticipantCap(String(tier))).toBe(cap)
);
it('is default OFF and makes no entitlement read', async () => {
  vi.stubEnv('MEET_CLASSROOM_LIMITS_ENABLED', 'false');
  expect(
    await getClassroomParticipantCap('meeting', 'workspace')
  ).toBeUndefined();
  expect(fixtures.admin).not.toHaveBeenCalled();
});
it('Free accepts only current confirmed exact-domain host identity', async () => {
  setup();
  expect(await getClassroomParticipantCap('meeting', 'workspace')).toBe(10);
  expect(fixtures.identity).toHaveBeenCalledWith(host);
});
it.each([
  'teacher@example.com',
  'teacher@sub.tuturuuu.com',
  'teacher@tuturuuu.com.attacker.invalid',
])('Free refuses host %s', async (email) => {
  setup('FREE', email);
  await expect(
    getClassroomParticipantCap('meeting', 'workspace')
  ).rejects.toMatchObject({ status: 403 });
});
it('paid host uses actual creator personal entitlement, never joining user tier', async () => {
  setup('PLUS', 'teacher@example.com');
  expect(await getClassroomParticipantCap('meeting', 'workspace')).toBe(50);
  expect(fixtures.tier).toHaveBeenCalledWith(host);
});
it('unavailable entitlement fails closed', async () => {
  setup();
  fixtures.tier.mockRejectedValueOnce(new Error('unavailable'));
  await expect(
    getClassroomParticipantCap('meeting', 'workspace')
  ).rejects.toMatchObject({ status: 503 });
});
it('moved or missing meeting does not mint policy', async () => {
  setup();
  fixtures.meeting.mockResolvedValueOnce({ data: null, error: null });
  await expect(
    getClassroomParticipantCap('meeting', 'workspace')
  ).rejects.toMatchObject({ status: 503 });
});
it('auth lookup subject mismatch is refused', async () => {
  setup();
  fixtures.identity.mockResolvedValueOnce({
    data: {
      user: {
        id: 'other',
        email: 'teacher@tuturuuu.com',
        email_confirmed_at: 'date',
        identities: [{ provider: 'email' }],
      },
    },
    error: null,
  });
  await expect(
    getClassroomParticipantCap('meeting', 'workspace')
  ).rejects.toMatchObject({ status: 403 });
});

it('unknown tiers still require the Free verified host rule', async () => {
  setup('UNKNOWN', 'teacher@example.com');
  await expect(
    getClassroomParticipantCap('meeting', 'workspace')
  ).rejects.toMatchObject({ status: 403 });
});
it('unconfirmed host identity cannot use Free capacity', async () => {
  setup();
  fixtures.identity.mockResolvedValueOnce({
    data: {
      user: {
        id: host,
        email: 'teacher@tuturuuu.com',
        email_confirmed_at: null,
        identities: [{ provider: 'email' }],
      },
    },
    error: null,
  });
  await expect(
    getClassroomParticipantCap('meeting', 'workspace')
  ).rejects.toMatchObject({ status: 403 });
});
