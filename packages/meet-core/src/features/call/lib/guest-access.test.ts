import { beforeEach, describe, expect, it, vi } from 'vitest';

const eventRpc = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('../server/guest-event-network', () => ({
  meetEventClientIp: (headers: Headers) =>
    headers.get('fixture-ip') ?? undefined,
  meetEventNetworkAllowed: async (ip: string | undefined) => Boolean(ip),
}));
vi.mock('@tuturuuu/meet-core/runtime', () => ({ MEETING_APP: 'meet' }));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/server/room-access', () => ({
  readMeetingRoomPolicy: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ rpc: eventRpc }),
}));
vi.mock('@tuturuuu/utils/meet-hosting', () => ({
  canVerifiedAccountHostMeeting: vi.fn(),
}));
vi.mock('./guest-admission', () => ({
  assertMeetGuestAdmissionAllowed: vi.fn(),
}));

import {
  getMeetGuestCallAccess,
  invalidateMeetGuestHostCache,
  isMeetGuestTurnstileConfigured,
  type MeetGuestJoinSources,
  resolveMeetGuestJoin,
} from './guest-access';
import { signMeetGuestSession } from './guest-session';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const meeting = {
  id: meetingId,
  name: 'CS101',
  creator_id: '11111111-1111-4111-8111-111111111111',
  ws_id: '22222222-2222-4222-8222-222222222222',
};

function sources(
  overrides: Partial<MeetGuestJoinSources> & {
    settings?: Record<string, unknown>;
    ended?: boolean;
  } = {}
): MeetGuestJoinSources {
  const { settings = { allowAnonymousGuests: true }, ended = false } =
    overrides;
  return {
    turnstileConfigured: () => true,
    isParleySession: async () => false,
    meeting: async () => ({ data: meeting, error: null }),
    hostPolicy: async () => ({
      canReadNotes: false,
      ended,
      settings: settings as never,
    }),
    hostCanHost: async () => true,
    ...overrides,
  };
}

beforeEach(() => invalidateMeetGuestHostCache(meetingId));

describe('resolveMeetGuestJoin', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('opens only when every gate holds', async () => {
    await expect(resolveMeetGuestJoin(meetingId, sources())).resolves.toEqual({
      kind: 'available',
      meeting,
    });
  });

  it.each([
    ['guest join is off by default', sources({ settings: {} })],
    ['the host plan cannot host', sources({ hostCanHost: async () => false })],
    ['the meeting ended', sources({ ended: true })],
    [
      'Turnstile is not configured',
      sources({ turnstileConfigured: () => false }),
    ],
    ['it is a Parley session', sources({ isParleySession: async () => true })],
    [
      'the meeting is missing',
      sources({ meeting: async () => ({ data: null, error: null }) }),
    ],
    [
      'the policy read fails',
      sources({
        hostPolicy: async () => {
          throw new Error('down');
        },
      }),
    ],
  ])('stays closed when %s', async (_label, input) => {
    await expect(resolveMeetGuestJoin(meetingId, input)).resolves.toEqual({
      kind: 'unavailable',
    });
  });
});

describe('getMeetGuestCallAccess', () => {
  const secret = 'meet-local-development-token-secret';

  it('returns lobby-only guest access for a valid cookie', async () => {
    const cookie = await signMeetGuestSession(
      {
        guestId: '33333333-3333-4333-8333-333333333333',
        meetingId,
        displayName: 'Hà My',
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      secret
    );
    await expect(
      getMeetGuestCallAccess(meetingId, cookie, new Headers(), sources())
    ).resolves.toMatchObject({
      guest: true,
      isHost: false,
      admission: 'lobby',
      canReadWorkspace: false,
      displayName: 'Hà My',
      user: { id: '33333333-3333-4333-8333-333333333333' },
    });
  });

  it('refuses event cookies when the real reputation resolver cannot obtain its authoritative row', async () => {
    const eventExpiresAt = Date.now() + 120_000;
    const cookie = await signMeetGuestSession(
      {
        guestId: '33333333-3333-4333-8333-333333333333',
        meetingId,
        displayName: 'Guest',
        exp: Math.floor(Date.now() / 1000) + 600,
        eventProof: eventExpiresAt,
      },
      secret
    );
    const policy = sources({
      settings: {
        allowAnonymousGuests: true,
        eventModeExpiresAt: eventExpiresAt,
      },
    });
    const requestHeaders = new Headers({
      'fixture-ip': '203.0.113.4',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    });
    eventRpc.mockResolvedValueOnce({
      data: null,
      error: new Error('Unavailable'),
    });
    await expect(
      getMeetGuestCallAccess(meetingId, cookie, requestHeaders, policy)
    ).resolves.toBeNull();
    expect(eventRpc).toHaveBeenCalledWith(
      'get_rate_limit_trust_decision',
      expect.objectContaining({ p_ip_address: '203.0.113.4' })
    );
    eventRpc.mockResolvedValueOnce({
      data: [
        {
          tier: 'challenge_required',
          trust_multiplier: 1,
          decision_source: 'reputation',
          subject_key: 'ip:203.0.113.4',
          limit_mode: 'inherit_multiplier',
        },
      ],
      error: null,
    });
    await expect(
      getMeetGuestCallAccess(meetingId, cookie, requestHeaders, policy)
    ).resolves.toMatchObject({
      eventProof: eventExpiresAt,
      admission: 'lobby',
    });
  });

  it('refuses a valid cookie once the host turns guest join off', async () => {
    const cookie = await signMeetGuestSession(
      {
        guestId: '33333333-3333-4333-8333-333333333333',
        meetingId,
        displayName: 'Hà My',
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      secret
    );
    await expect(
      getMeetGuestCallAccess(
        meetingId,
        cookie,
        new Headers(),
        sources({ settings: {} })
      )
    ).resolves.toBeNull();
    await expect(
      getMeetGuestCallAccess(
        meetingId,
        'forged.cookie',
        new Headers(),
        sources()
      )
    ).resolves.toBeNull();
  });
});

describe('isMeetGuestTurnstileConfigured', () => {
  it('needs both keys outside development', () => {
    expect(isMeetGuestTurnstileConfigured({ NODE_ENV: 'production' })).toBe(
      false
    );
    expect(
      isMeetGuestTurnstileConfigured({
        NODE_ENV: 'production',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
      })
    ).toBe(false);
    expect(
      isMeetGuestTurnstileConfigured({
        NODE_ENV: 'production',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
        TURNSTILE_SECRET_KEY: 'secret',
      })
    ).toBe(true);
  });
});
