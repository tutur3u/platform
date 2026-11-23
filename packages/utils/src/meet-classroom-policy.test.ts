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
  getMeetRoomCapacityLimits,
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
  expect(await getClassroomParticipantCap('meeting', 'workspace')).toBe(100);
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
it('staff host gets 100 on any tier', async () => {
  for (const tier of ['FREE', 'PLUS', 'PRO', 'ENTERPRISE']) {
    setup(tier, 'teacher@tuturuuu.com');
    expect(await getClassroomParticipantCap('meeting', 'workspace')).toBe(100);
  }
  setup('FREE', 'teacher@tuturuuu.com');
  expect(await capacityFor('call')).toEqual({
    maxParticipants: 100,
    maxPublishers: 100,
    maxViewers: 100,
  });
});
it('non-staff paid hosts keep tier caps and Free non-staff is refused', async () => {
  for (const [tier, cap] of [
    ['PLUS', 50],
    ['PRO', 50],
    ['ENTERPRISE', 100],
  ] as const) {
    setup(tier, 'teacher@example.com');
    expect(await getClassroomParticipantCap('meeting', 'workspace')).toBe(cap);
  }
  setup('FREE', 'teacher@example.com');
  await expect(capacityFor('call')).rejects.toMatchObject({ status: 403 });
});
it('lookup failures do not throw in strict mode', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  setup();
  fixtures.tier.mockRejectedValueOnce(new Error('unavailable'));
  expect(
    await getClassroomParticipantCap('meeting', 'workspace')
  ).toBeUndefined();
  fixtures.tier.mockRejectedValueOnce(new Error('unavailable'));
  expect(await capacityFor('call')).toEqual({
    maxParticipants: undefined,
    maxPublishers: 8,
    maxViewers: 96,
  });
  fixtures.identity.mockResolvedValueOnce({
    data: { user: null },
    error: new Error('auth down'),
  });
  expect(
    await getClassroomParticipantCap('meeting', 'workspace')
  ).toBeUndefined();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
it('moved or missing meeting falls back instead of minting policy', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  setup();
  fixtures.meeting.mockResolvedValueOnce({ data: null, error: null });
  expect(
    await getClassroomParticipantCap('meeting', 'workspace')
  ).toBeUndefined();
  warn.mockRestore();
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

const capacityFor = (mode: 'call' | 'webinar', parley = false) =>
  getMeetRoomCapacityLimits({
    meetingId: 'meeting',
    wsId: 'workspace',
    mode,
    parley,
  });

it.each([
  ['FREE', 100, 8, 96, 12],
  ['PLUS', 50, 50, 50, 50],
  ['PRO', 50, 50, 50, 50],
  ['ENTERPRISE', 100, 100, 100, 100],
])(
  'signs strict and flag-off call and webinar limits for %s',
  async (tier, cap, publishers, viewers, webinarPublishers) => {
    // FREE non-staff is refused in strict mode, so the table uses a staff host
    // only for FREE and checks the tier cap against a non-staff host otherwise.
    setup(
      tier,
      tier === 'FREE' ? 'teacher@tuturuuu.com' : 'teacher@example.com'
    );
    expect(await capacityFor('call')).toEqual({
      maxParticipants: cap,
      maxPublishers: cap,
      maxViewers: cap,
    });
    expect(await capacityFor('webinar')).toEqual({
      maxParticipants: cap,
      maxPublishers: cap,
      maxViewers: 250,
    });
    fixtures.identity.mockClear();
    vi.stubEnv('MEET_CLASSROOM_LIMITS_ENABLED', 'false');
    expect(await capacityFor('call')).toEqual({
      maxParticipants: undefined,
      maxPublishers: publishers,
      maxViewers: viewers,
    });
    expect(await capacityFor('webinar')).toEqual({
      maxParticipants: undefined,
      maxPublishers: webinarPublishers,
      maxViewers: 250,
    });
    expect(fixtures.identity).not.toHaveBeenCalled();
  }
);

it('skips all reads in Parley and falls back on tier errors with the flag off', async () => {
  setup('FREE', 'host@example.test');
  expect(await capacityFor('webinar', true)).toEqual({
    maxParticipants: undefined,
    maxPublishers: 12,
    maxViewers: 250,
  });
  expect(fixtures.admin).not.toHaveBeenCalled();
  await expect(capacityFor('call')).rejects.toMatchObject({ status: 403 });
  vi.stubEnv('MEET_CLASSROOM_LIMITS_ENABLED', 'false');
  expect(await capacityFor('call')).toEqual({
    maxParticipants: undefined,
    maxPublishers: 8,
    maxViewers: 96,
  });
});
