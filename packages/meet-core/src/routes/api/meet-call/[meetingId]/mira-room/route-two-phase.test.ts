import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  available: vi.fn(),
  room: vi.fn(),
  accept: vi.fn(),
  end: vi.fn(),
  record: vi.fn(),
  boxDefault: vi.fn(),
  lastChoice: vi.fn(),
  openRevision: vi.fn(),
  canStore: vi.fn(),
  cf: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: f.cf }));
vi.mock('../../../../../features/meeting-ai/server/per-speaker-flag', () => ({
  meetPerSpeakerEnabled: f.perSpeaker,
}));
vi.mock(
  '../../../../../features/live-assistant/server/room-mira-authority',
  () => ({ readRoomMiraAvailability: f.available })
);
vi.mock(
  '../../../../../features/live-assistant/server/room-mira-acceptance',
  () => ({ acceptRoomMira: f.accept, endRoomMira: f.end })
);
vi.mock(
  '../../../../../features/live-assistant/server/room-mira-evidence',
  () => ({
    recordMiraChoice: f.record,
    MiraChoiceRecordError: class extends Error {
      constructor(public pgCode?: string) {
        super('Mira choice could not be recorded');
      }
    },
    canStoreMiraNoticeMode: f.canStore,
    readMiraBoxTickedByDefault: f.boxDefault,
    readOpenMiraAcceptanceRevision: f.openRevision,
    readOwnMiraLastChoice: f.lastChoice,
  })
);
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
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
const guestAccess = {
  user: { id: '00000000-0000-4000-8000-0000000000d4' },
  guest: true,
  meeting: { id: 'room', ws_id: 'ws' },
};
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: f.room,
  guestPollRoomRoute: async (
    _request: Request,
    _id: string,
    run: (access: unknown) => Promise<unknown>
  ) => Response.json(await run(guestAccess)),
}));

import { MIRA_ROOM_NOTICE_VERSION as version } from '@tuturuuu/realtime/meet';
import { POST } from './route';

const params = { params: Promise.resolve({ meetingId: 'room' }) };
const post = (body: unknown) =>
  POST(
    new Request('https://meet.test/mira-room', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params
  );
const read = { version, choice: null, acceptance: null, ready: false };
const PENDING = '0b1e0d1c-2f3a-4b5c-8d6e-7f8091a2b3c4';
/** The room holds every on as pending and answers its id; else the view. */
const roomDefault = async (
  _access: unknown,
  command: { action: string; choice?: string }
) =>
  command.action === 'mira.room.choice' && command.choice === 'on'
    ? { pendingId: PENDING, pendingUntil: Date.now() + 20_000, view: read }
    : read;
const choice = (overrides: Record<string, unknown> = {}) => ({
  action: 'choice',
  choice: 'on',
  version,
  acceptanceRevision: 1,
  source: 'join',
  textHash: 'a'.repeat(64),
  locale: 'vi',
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  f.available.mockResolvedValue(true);
  f.room.mockImplementation(roomDefault);
  f.boxDefault.mockResolvedValue(true);
  f.lastChoice.mockResolvedValue(null);
  f.record.mockResolvedValue(undefined);
  f.canStore.mockResolvedValue(true);
});

const roomIn = (mode: 'room' | 'self' | undefined) =>
  f.room.mockImplementation(async (access, command: { action: string }) =>
    command.action === 'transcript.consent.read'
      ? { mode }
      : roomDefault(access, command)
  );
const confirmCalls = () =>
  f.room.mock.calls.filter(
    ([, command]) =>
      (command as { action: string }).action === 'mira.room.confirm'
  );

describe('two-phase on', () => {
  it('writes the evidence with the pending id, then confirms it', async () => {
    const order: string[] = [];
    f.record.mockImplementation(async () => {
      order.push('evidence');
    });
    f.room.mockImplementation(async (access, command: { action: string }) => {
      order.push(command.action);
      return roomDefault(access, command);
    });
    const response = await post(choice());
    expect(response.status).toBe(200);
    expect(order).toEqual([
      'transcript.consent.read',
      'mira.room.choice',
      'evidence',
      'mira.room.confirm',
      'mira.room.read',
    ]);
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'on', pendingId: PENDING })
    );
    expect(confirmCalls()[0]?.[1]).toEqual({
      action: 'mira.room.confirm',
      pendingId: PENDING,
    });
    // The id never reaches the client: only the view comes back.
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain(PENDING);
    expect(body).not.toContain('pendingId');
    expect(body).not.toContain('pendingUntil');
  });

  const oldRoom = () =>
    f.room.mockImplementation(
      async (access, command: { action: string; choice?: string }) =>
        command.action === 'mira.room.choice' && command.choice === 'on'
          ? { ...read, choice: 'on' }
          : roomDefault(access, command)
    );
  const choicesSent = () =>
    f.room.mock.calls
      .filter(
        ([, command]) =>
          (command as { action: string }).action === 'mira.room.choice'
      )
      .map(([, command]) => (command as { choice: string }).choice);

  it('records an old room on without a pending id as effective', async () => {
    oldRoom();
    expect((await post(choice())).status).toBe(200);
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'on' })
    );
    expect(f.record.mock.calls[0]?.[0]).not.toHaveProperty('pendingId');
    expect(confirmCalls()).toHaveLength(0);
    expect(choicesSent()).toEqual(['on']);
  });

  it('compensates an old room on whose evidence fails, then answers 503', async () => {
    oldRoom();
    f.record.mockImplementation(async (evidence: { source: string }) => {
      if (evidence.source !== 'system_fallback') throw new Error('db');
    });
    await expect(post(choice())).rejects.toMatchObject({ status: 503 });
    expect(choicesSent()).toEqual(['on', 'off']);
    expect(f.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ choice: 'off', source: 'system_fallback' })
    );
    expect(confirmCalls()).toHaveLength(0);
  });

  it('alerts when an old room cannot be turned back off', async () => {
    const alert = vi.spyOn(console, 'error').mockImplementation(() => {});
    f.room.mockImplementation(
      async (access, command: { action: string; choice?: string }) => {
        if (command.action === 'mira.room.choice' && command.choice === 'on')
          return { ...read, choice: 'on' };
        if (command.action === 'mira.room.choice' && command.choice === 'off')
          throw Object.assign(new Error('room'), { status: 504 });
        return roomDefault(access, command);
      }
    );
    f.record.mockRejectedValue(new Error('db'));
    await expect(post(choice())).rejects.toMatchObject({ status: 503 });
    expect(choicesSent()).toEqual(['on', 'off', 'off']);
    expect(alert).toHaveBeenCalledWith(
      '[meet-mira] room on left without evidence',
      { meetingId: 'room', accountId: guestAccess.user.id }
    );
    alert.mockRestore();
  });

  it('treats a null pending id as already on: no evidence, no confirm', async () => {
    f.room.mockImplementation(
      async (access, command: { action: string; choice?: string }) =>
        command.action === 'mira.room.choice' && command.choice === 'on'
          ? { ...read, choice: 'on', pendingId: null }
          : roomDefault(access, command)
    );
    expect((await post(choice())).status).toBe(200);
    expect(f.record).not.toHaveBeenCalled();
    expect(confirmCalls()).toHaveLength(0);
  });

  it('keeps the evidence and confirm alive with waitUntil when the Worker offers it', async () => {
    const waitUntil = vi.fn();
    f.cf.mockResolvedValue({ ctx: { waitUntil } });
    expect((await post(choice())).status).toBe(200);
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(waitUntil.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
    expect(confirmCalls()).toHaveLength(1);
  });

  it('still answers when no Worker context exists', async () => {
    f.cf.mockRejectedValue(new Error('no context'));
    expect((await post(choice())).status).toBe(200);
    expect(confirmCalls()).toHaveLength(1);
  });

  it('passes the notice mode through to the confirm', async () => {
    roomIn('self');
    await post(choice({ noticeMode: 'self' }));
    expect(confirmCalls()[0]?.[1]).toEqual({
      action: 'mira.room.confirm',
      pendingId: PENDING,
      noticeMode: 'self',
    });
  });

  it('retries a transient evidence failure once before confirming', async () => {
    f.record
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue(undefined);
    expect((await post(choice())).status).toBe(200);
    expect(f.record).toHaveBeenCalledTimes(2);
    expect(confirmCalls()).toHaveLength(1);
  });

  it('does not retry an evidence refusal the database will repeat', async () => {
    const { MiraChoiceRecordError } =
      await import('../../../../../features/live-assistant/server/room-mira-evidence');
    f.record.mockRejectedValue(new MiraChoiceRecordError('23503'));
    await expect(post(choice())).rejects.toMatchObject({ status: 503 });
    expect(f.record).toHaveBeenCalledTimes(1);
    expect(confirmCalls()).toHaveLength(0);
  });

  it('answers 503 when the room says the pending on expired', async () => {
    const { MeetCallAccessError } =
      await import('@tuturuuu/meet-core/features/call/lib/call-access');
    f.room.mockImplementation(async (access, command: { action: string }) => {
      if (command.action === 'mira.room.confirm')
        throw new MeetCallAccessError(
          409,
          'Room action is unavailable',
          'MIRA_ROOM_PENDING_EXPIRED'
        );
      return roomDefault(access, command);
    });
    await expect(post(choice())).rejects.toMatchObject({ status: 503 });
    expect(f.record).toHaveBeenCalledOnce();
  });

  it('refuses an on with a malformed pending id and never writes or confirms', async () => {
    f.room.mockImplementation(
      async (access, command: { action: string; choice?: string }) =>
        command.action === 'mira.room.choice' && command.choice === 'on'
          ? { ...read, pendingId: 'not-a-uuid' }
          : roomDefault(access, command)
    );
    await expect(post(choice())).rejects.toMatchObject({ status: 503 });
    expect(f.record).not.toHaveBeenCalled();
    expect(confirmCalls()).toHaveLength(0);
  });

  it.each([
    ['an unparseable 2xx body', new SyntaxError('Unexpected token')],
    ['a lost answer', new Error('fetch failed')],
    ['a room 5xx', Object.assign(new Error('room'), { status: 502 })],
  ])(
    'answers 503 for an on with %s, turning the room back off first',
    async (_label, failure) => {
      f.room.mockImplementation(
        async (access, command: { action: string; choice?: string }) => {
          if (command.action === 'mira.room.choice' && command.choice === 'on')
            throw failure;
          return roomDefault(access, command);
        }
      );
      await expect(post(choice())).rejects.toMatchObject({ status: 503 });
      expect(f.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ choice: 'on' })
      );
      expect(confirmCalls()).toHaveLength(0);
      const offs = f.room.mock.calls.filter(
        ([, command]) => (command as { choice?: string }).choice === 'off'
      );
      expect(offs).toHaveLength(1);
    }
  );

  it('passes a clear room refusal of the on through', async () => {
    const { MeetCallAccessError } =
      await import('@tuturuuu/meet-core/features/call/lib/call-access');
    f.room.mockImplementation(
      async (access, command: { action: string; choice?: string }) => {
        if (command.action === 'mira.room.choice' && command.choice === 'on')
          throw new MeetCallAccessError(409, 'Confirm in the call');
        return roomDefault(access, command);
      }
    );
    await expect(post(choice())).rejects.toMatchObject({ status: 409 });
    expect(f.record).not.toHaveBeenCalled();
  });
});
