import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./call-session', () => ({
  getMeetCallSession: vi.fn(),
}));
vi.mock('./call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

import { MeetCallAccessError } from './call-access';
import type { MeetGuestCallAccess } from './guest-access';
import { assertMeetGuestAdmissionAllowed } from './guest-admission';
import { getMeetCallSession } from './call-session';

const access: MeetGuestCallAccess = {
  guest: true,
  user: { id: '33333333-3333-4333-8333-333333333333' },
  meeting: {
    id: '7f2a528e-3bff-40ee-bfda-5b944ad03ed8',
    name: 'Demo',
    creator_id: '11111111-1111-4111-8111-111111111111',
    ws_id: '22222222-2222-4222-8222-222222222222',
  },
  isHost: false,
  displayName: 'Guest',
  avatarUrl: undefined,
  needsDisplayName: false,
  suggestedDisplayName: 'Guest',
  admission: 'lobby',
  canReadWorkspace: false,
  workspaceSlug: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ blocked: false }))
  );
  vi.mocked(getMeetCallSession).mockResolvedValue({
    realtimeUrl: 'wss://rt.test/socket',
    token: 'service-token',
    displayName: 'Guest',
    role: 'speaker',
  });
});

it('blocks guest token minting while the removal window is active', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ blocked: true }))
  );
  await expect(assertMeetGuestAdmissionAllowed(access)).rejects.toBeInstanceOf(
    MeetCallAccessError
  );
  await expect(assertMeetGuestAdmissionAllowed(access)).rejects.toMatchObject({
    code: 'MEET_GUEST_REMOVED',
  });
});
