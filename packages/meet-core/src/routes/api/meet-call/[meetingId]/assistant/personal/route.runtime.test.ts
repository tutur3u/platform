// @vitest-environment node
/**
 * A typed Private Mira question through the production Meet Worker wiring:
 * the native Meet `getCloudflareContext` shim, the real room-service client
 * and the real room command router on an in-memory room snapshot. Only
 * identity, billing and the model are faked.
 */
import {
  admitOrHold,
  createMeetRoomSnapshot,
  MIRA_PRIVATE_NOTICE_VERSION,
  meetRealtimeTokenPayloadSchema,
} from '@tuturuuu/realtime/meet';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type RoomServiceState,
  roomService,
} from '../../../../../../../../../apps/meet-realtime/src/room-service';

const fixture = vi.hoisted(() => {
  const owner = '00000000-0000-4000-8000-0000000000a1';
  const meetingId = '00000000-0000-4000-8000-0000000000b2';
  const wsId = '00000000-0000-4000-8000-0000000000c3';
  class MeetCallAccessError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
      public retryAfterSeconds?: number
    ) {
      super(message);
    }
  }
  // vi.mock factories are hoisted above module code, so the shared module
  // factories live here rather than in top-level consts.
  const callAccess = () => ({
    MeetCallAccessError,
    getMeetCallAccess: async () => ({
      user: { id: owner },
      meeting: { id: meetingId, ws_id: wsId },
      isHost: true,
      displayName: 'Host',
      admission: 'open',
      canReadWorkspace: true,
    }),
  });
  const callSession = () => ({
    getMeetCallSession: async () => ({
      realtimeUrl: 'wss://realtime.test/realtime',
      token: 'synthetic-test',
    }),
  });
  return {
    owner,
    meetingId,
    wsId,
    callAccess,
    callSession,
    MeetCallAccessError,
    request: {} as { cloudflare?: unknown },
    confirmation: false,
    waits: [] as Promise<unknown>[],
  };
});

const { owner, meetingId, wsId } = fixture;

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class extends Error {},
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  AccountServiceError: class extends Error {},
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/lib/call-access',
  fixture.callAccess
);
vi.mock('../../../../../../features/call/lib/call-access', fixture.callAccess);
vi.mock(
  '@tuturuuu/meet-core/features/call/lib/call-session',
  fixture.callSession
);
vi.mock(
  '../../../../../../features/call/lib/call-session',
  fixture.callSession
);
vi.mock('../../../../../../features/call/lib/guest-access', () => ({
  getMeetGuestCallAccess: vi.fn(),
}));
vi.mock('../../../../../../features/call/lib/guest-session', () => ({
  MEET_GUEST_COOKIE: 'guest',
}));
vi.mock(
  '../../../../../../features/live-assistant/server/demo-authority',
  () => ({
    readMiraDemoAuthority: async () => ({ allowed: true, payer: 'self' }),
  })
);
vi.mock(
  '../../../../../../features/live-assistant/server/account-confirmation',
  () => ({
    usesMiraAccountConfirmation: () => fixture.confirmation,
    requireMiraAccountConfirmation: async () => undefined,
    readMiraConfirmedAt: async () => 0,
  })
);
// The metered model call; it still runs the route's consent recheck.
vi.mock('../../../../../../features/call/server/personal-assistant', () => ({
  answerPersonalMeetChat: async (
    _userId: string,
    _input: unknown,
    provider: { checkConsent: () => Promise<void> }
  ) => {
    await provider.checkConsent();
    return { text: 'A private reply' };
  },
}));
// The native Meet Worker's own `@opennextjs/cloudflare` stand-in.
vi.mock(
  '../../../../../../../../../apps/meet/src/runtime/request-context',
  () => ({ meetRequest: () => fixture.request })
);
vi.mock(
  '@opennextjs/cloudflare',
  () =>
    import('../../../../../../../../../apps/meet/src/runtime/cloudflare-context')
);

import { POST } from './route';

const token = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId,
  mode: 'call',
  role: 'host',
  roomId: 'room',
  scopes: ['meet:server'],
  userId: owner,
  accountId: owner,
  wsId,
});

/** The room as the Durable Object answers `/room-service`, in memory. */
function serveRoom(initial: RoomServiceState) {
  const room = { state: initial, actions: [] as string[] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body));
      room.actions.push(command.action);
      const result = roomService(room.state, token, command);
      room.state = result.state;
      return Response.json(result.body, { status: result.status ?? 200 });
    })
  );
  return room;
}

/** The owner is in the room and chose Continue with Private Mira. */
function freshRoom(): RoomServiceState {
  let state: RoomServiceState = createMeetRoomSnapshot();
  state = admitOrHold(state, token, '2026-11-25T00:00:00Z').state;
  return roomService(state, token, {
    action: 'mira.private.choice',
    choice: 'continue',
    version: MIRA_PRIVATE_NOTICE_VERSION,
  }).state;
}

/**
 * A room persisted before tutor-chat sharing and request receipts existed:
 * no share grants, no pending shared chat, no receipts, through JSON as the
 * Durable Object stores it.
 */
function oldRoom(): RoomServiceState {
  const {
    miraShares: _shares,
    miraSharePending: _pending,
    personalChatReceipts: _receipts,
    ...older
  } = freshRoom();
  return JSON.parse(JSON.stringify(older));
}

function ask(question = 'What is photosynthesis?') {
  return POST(
    new Request('https://meet.example.test/api', {
      method: 'POST',
      headers: { origin: 'https://meet.example.test' },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        startedAt: Date.now(),
        question,
        timezone: 'UTC',
        history: [],
      }),
    }),
    { params: Promise.resolve({ meetingId }) }
  );
}

beforeEach(() => {
  fixture.confirmation = false;
  fixture.waits = [];
  fixture.request = {
    cloudflare: {
      env: { MEET_AI_DISABLED: 'false', GOOGLE_GENERATIVE_AI_API_KEY: 'key' },
      ctx: { waitUntil: (work: Promise<unknown>) => fixture.waits.push(work) },
    },
  };
});
afterEach(() => vi.unstubAllGlobals());

it('answers a typed question in a fresh room', async () => {
  const room = serveRoom(freshRoom());
  const response = await ask();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: 'A private reply' });
  // Consent, the receipt, the recheck before the model, the stored answer and
  // the final recheck: every room action a typed question makes.
  expect(room.actions).toEqual([
    'mira.private.read',
    'personal.begin',
    'mira.private.read',
    'personal.finish',
    'mira.private.read',
  ]);
});

it('answers a typed question in a room persisted before sharing existed', async () => {
  const room = serveRoom(oldRoom());
  expect(room.state.miraShares).toBeUndefined();
  expect(room.state.personalChatReceipts).toBeUndefined();
  const response = await ask();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: 'A private reply' });
  expect(fixture.waits).toHaveLength(0);
});

it('answers and forwards the tutor chat while the owner shares it', async () => {
  fixture.confirmation = true;
  const shared = roomService(freshRoom(), token, {
    action: 'mira.share.set',
    enabled: true,
  });
  expect(shared.body).toMatchObject({ enabled: true });
  const room = serveRoom(shared.state);
  const response = await ask('Explain it again');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: 'A private reply' });
  await Promise.all(fixture.waits);
  expect(room.actions).toContain('mira.share.context');
  expect(room.state.miraShares?.[owner]?.context?.bytes).toBeGreaterThan(0);
});

it('answers without forwarding anything while the share is off', async () => {
  fixture.confirmation = true;
  const room = serveRoom(freshRoom());
  const response = await ask();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: 'A private reply' });
  expect(fixture.waits).toHaveLength(0);
  expect(room.actions).not.toContain('mira.share.context');
});

it('types a room that cannot be reached instead of a generic 500', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('fetch failed');
    })
  );
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await ask();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: 'MIRA_PRIVATE_ROOM_UNAVAILABLE',
  });
  expect(JSON.stringify(errors.mock.calls)).not.toContain('photosynthesis');
  errors.mockRestore();
});
