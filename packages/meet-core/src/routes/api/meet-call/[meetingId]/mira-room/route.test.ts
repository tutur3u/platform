import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  access: { guest: true, userId: '' },
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale }: { locale: 'en' | 'vi' }) => {
    const { default: messages } = locale === 'vi'
      ? await import('../../../../../../../../apps/meet/messages/vi.json')
      : await import('../../../../../../../../apps/meet/messages/en.json');
    const strings = messages.meet.mira_consent;
    return (key: keyof typeof strings, values?: { name: string }) =>
      values ? strings[key].replace('{name}', values.name) : strings[key];
  },
}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: f.cf }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: f.getUserById,
        updateUserById: f.updateUserById,
      },
    },
  }),
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
  ) => Response.json(await run({
      ...guestAccess,
      guest: f.access.guest,
      user: { id: f.access.userId || guestAccess.user.id },
    })),
}));

import { MIRA_ROOM_NOTICE_VERSION as version } from '@tuturuuu/realtime/meet';
import { GET, POST } from './route';

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
  f.access.guest = true;
  f.access.userId = '';
  f.available.mockResolvedValue(true);
  f.room.mockImplementation(roomDefault);
  f.boxDefault.mockResolvedValue(true);
  f.lastChoice.mockResolvedValue(null);
  f.record.mockResolvedValue(undefined);
  f.canStore.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

it('hides Mira without touching the room when it is unavailable', async () => {
  f.available.mockResolvedValue(false);
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({ available: false });
  expect(f.room).not.toHaveBeenCalled();
});

it('reads the caller view with the workspace box default, guests included', async () => {
  f.boxDefault.mockResolvedValue(false);
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({
    available: true,
    ...read,
    boxTickedByDefault: false,
  });
  expect(f.room).toHaveBeenCalledWith(guestAccess, {
    action: 'mira.room.read',
  });
  expect(f.boxDefault).toHaveBeenCalledWith('ws');
});

it('records the caller final state, notice, text hash and locale as their own choice', async () => {
  await post(choice({ choice: 'off' }));
  expect(f.room).toHaveBeenCalledWith(guestAccess, {
    action: 'mira.room.choice',
    choice: 'off',
    version,
    acceptanceRevision: 1,
    source: 'join',
  });
  expect(f.record).toHaveBeenCalledWith({
    meetingId: 'room',
    wsId: 'ws',
    participantId: guestAccess.user.id,
    guest: true,
    choice: 'off',
    source: 'join',
    acceptanceRevision: 1,
    noticeVersion: version,
    textHash: 'a'.repeat(64),
    locale: 'vi',
  });
  for (const body of [
    choice({ version: 'old' }),
    choice({ accountId: 'someone-else' }),
    choice({ choice: 'leave' }),
    choice({ textHash: 'short' }),
    { action: 'accept', capabilities: ['chat'] },
  ])
    await expect(post(body)).rejects.toMatchObject({ status: 400 });
});

it('always lets a participant turn off, but on needs Mira available', async () => {
  f.available.mockResolvedValue(false);
  await expect(post(choice())).rejects.toMatchObject({ status: 403 });
  await post(choice({ choice: 'off' }));
  expect(f.room).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'mira.room.choice', choice: 'off' })
  );
});

it('never confirms an on whose evidence cannot be stored', async () => {
  f.record.mockRejectedValue(new Error('db'));
  await expect(post(choice())).rejects.toMatchObject({ status: 503 });
  const actions = f.room.mock.calls.map(
    ([, command]) => command as { action: string; choice?: string }
  );
  expect(
    actions.some((command) => command.action === 'mira.room.confirm')
  ).toBe(false);
  // No compensating off: the pending on lapses by itself.
  expect(actions.filter((command) => command.choice === 'off')).toHaveLength(0);
});

it('records no evidence for a Join state the room refuses to turn back on', async () => {
  const { MeetCallAccessError } =
    await import('@tuturuuu/meet-core/features/call/lib/call-access');
  f.room.mockImplementation(async (_access, command: { action: string }) => {
    if (command.action === 'mira.room.choice')
      throw new MeetCallAccessError(409, 'Confirm in the call');
    return read;
  });
  await expect(post(choice())).rejects.toMatchObject({ status: 409 });
  expect(f.room).toHaveBeenCalledWith(
    guestAccess,
    expect.objectContaining({ choice: 'on', source: 'join' })
  );
  expect(f.record).not.toHaveBeenCalled();
});

it('routes acceptance, turning off and minor reports to the acceptance flow', async () => {
  await post({
    action: 'accept',
    capabilities: ['chat', 'captions'],
    audienceAdultConfirmed: true,
  });
  expect(f.accept).toHaveBeenCalledWith(guestAccess, ['chat', 'captions']);
  await post({ action: 'end' });
  expect(f.end).toHaveBeenCalledWith(guestAccess, 'turned_off');
  await post({ action: 'report_minor' });
  expect(f.end).toHaveBeenCalledWith(guestAccess, 'minor_reported');
});

it('gives a participant who is not admitted yet the join box default and the open revision', async () => {
  const { MeetCallAccessError } =
    await import('@tuturuuu/meet-core/features/call/lib/call-access');
  f.room.mockRejectedValue(new MeetCallAccessError(403, 'Join first'));
  f.boxDefault.mockResolvedValue(false);
  f.openRevision.mockResolvedValue(4);
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({
    available: false,
    joinDefault: false,
    joinRevision: 4,
    joinLastChoice: null,
  });
  // A failed default lookup shows the box unticked instead of failing.
  f.room.mockRejectedValue(new MeetCallAccessError(403, 'Join first'));
  f.boxDefault.mockRejectedValue(new Error('db'));
  expect(
    await (await GET(new Request('https://meet.test/x'), params)).json()
  ).toEqual({
    available: false,
    joinDefault: false,
    joinRevision: 4,
    joinLastChoice: null,
  });
  f.room.mockRejectedValue(new MeetCallAccessError(503, 'Down'));
  await expect(
    GET(new Request('https://meet.test/x'), params)
  ).rejects.toMatchObject({ status: 503 });
});

const roomIn = (mode: 'room' | 'self' | undefined) =>
  f.room.mockImplementation(async (access, command: { action: string }) =>
    command.action === 'transcript.consent.read'
      ? { mode }
      : roomDefault(access, command)
  );
const choiceCalls = () =>
  f.room.mock.calls.filter(
    ([, command]) =>
      (command as { action: string }).action === 'mira.room.choice'
  );

it.each([
  ['a room-capture notice in a per-speaker room', 'self', undefined],
  ['an explicit room notice in a per-speaker room', 'self', 'room'],
  ['a per-speaker notice in a room-capture room', 'room', 'self'],
  ['a per-speaker notice in a room with no mode', undefined, 'self'],
] as const)('refuses on under %s', async (_label, mode, noticeMode) => {
  roomIn(mode);
  await expect(
    post(choice(noticeMode ? { noticeMode } : {}))
  ).rejects.toMatchObject({ status: 409, code: 'MIRA_ROOM_NOTICE_MODE_STALE' });
  expect(choiceCalls()).toHaveLength(0);
  expect(f.record).not.toHaveBeenCalled();
});

it('never refuses off for a stale notice mode', async () => {
  roomIn('self');
  await post(choice({ choice: 'off' }));
  expect(choiceCalls()).toHaveLength(1);
  expect(f.record).toHaveBeenCalledWith(
    expect.not.objectContaining({ noticeMode: expect.anything() })
  );
});

it('records a per-speaker off without requiring its mode or reading the room', async () => {
  roomIn('self');
  f.canStore.mockRejectedValue(new Error('probe down'));
  await post(choice({ choice: 'off', noticeMode: 'self' }));
  expect(choiceCalls()).toHaveLength(1);
  expect(f.canStore).not.toHaveBeenCalled();
  expect(f.record).toHaveBeenCalledWith(
    expect.objectContaining({
      choice: 'off',
      noticeMode: 'self',
      requireNoticeMode: false,
    })
  );
  const reads = f.room.mock.calls.filter(
    ([, command]) =>
      (command as { action: string }).action === 'transcript.consent.read'
  );
  expect(reads).toHaveLength(0);
});

it('keeps the room-capture on payload and evidence unchanged', async () => {
  roomIn('room');
  await post(choice());
  expect(f.record.mock.calls[0]?.[0]).not.toHaveProperty('noticeMode');
  expect(f.canStore).not.toHaveBeenCalled();
});

it('requires the stored mode for an on in a per-speaker room', async () => {
  roomIn('self');
  await post(choice({ noticeMode: 'self' }));
  expect(f.canStore).toHaveBeenCalledOnce();
  expect(f.record).toHaveBeenCalledWith(
    expect.objectContaining({ noticeMode: 'self', requireNoticeMode: true })
  );
});

it.each([
  ['the column is missing', () => f.canStore.mockResolvedValue(false)],
  [
    'the storage check fails',
    () => f.canStore.mockRejectedValue(new Error('x')),
  ],
])(
  'refuses a per-speaker on before the room changes when %s',
  async (_label, arrange) => {
    roomIn('self');
    arrange();
    await expect(post(choice({ noticeMode: 'self' }))).rejects.toMatchObject({
      status: 503,
    });
    expect(choiceCalls()).toHaveLength(0);
    expect(f.record).not.toHaveBeenCalled();
  }
);

it('refuses an unknown notice mode', async () => {
  await expect(post(choice({ noticeMode: 'both' }))).rejects.toMatchObject({
    status: 400,
  });
});

it.each(['self', 'room'] as const)(
  'forwards the %s notice mode to the room choice',
  async (noticeMode) => {
    roomIn(noticeMode);
    await post(choice({ noticeMode }));
    expect(choiceCalls()[0]?.[1]).toMatchObject({ noticeMode });
  }
);

it('sends no notice mode to the room when the client names none', async () => {
  roomIn('room');
  await post(choice());
  expect(choiceCalls()[0]?.[1]).not.toHaveProperty('noticeMode');
});

it('passes the room notice-mode refusal through as its code', async () => {
  const { MeetCallAccessError } =
    await import('@tuturuuu/meet-core/features/call/lib/call-access');
  f.room.mockImplementation(async (_access, command: { action: string }) => {
    if (command.action === 'mira.room.choice')
      throw new MeetCallAccessError(
        409,
        'Room action is unavailable',
        'MIRA_ROOM_NOTICE_MODE_STALE'
      );
    return command.action === 'transcript.consent.read'
      ? { mode: 'self' }
      : read;
  });
  await expect(post(choice({ noticeMode: 'self' }))).rejects.toMatchObject({
    status: 409,
    code: 'MIRA_ROOM_NOTICE_MODE_STALE',
  });
  expect(f.record).not.toHaveBeenCalled();
});

it('records a room-notice on after an earlier per-speaker on as a new choice', async () => {
  roomIn('room');
  await post(choice());
  expect(f.record).toHaveBeenCalledWith(
    expect.objectContaining({ choice: 'on' })
  );
  expect(f.record.mock.calls[0]?.[0]).not.toHaveProperty('noticeMode');
});

describe('withdrawal evidence', () => {
  const failRoomChoice = async (status: number) => {
    const { MeetCallAccessError } =
      await import('@tuturuuu/meet-core/features/call/lib/call-access');
    f.room.mockImplementation(async (_access, command: { action: string }) => {
      if (command.action === 'mira.room.choice')
        throw new MeetCallAccessError(status, 'Room action is unavailable');
      return read;
    });
  };

  it('records an off even when the room call fails, then returns the room error', async () => {
    await failRoomChoice(502);
    await expect(post(choice({ choice: 'off' }))).rejects.toMatchObject({
      status: 502,
    });
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'off', source: 'join' })
    );
  });

  it('answers 503 when neither the room nor the ledger took the off', async () => {
    await failRoomChoice(504);
    f.record.mockRejectedValue(new Error('db'));
    await expect(post(choice({ choice: 'off' }))).rejects.toMatchObject({
      status: 503,
    });
    expect(f.record).toHaveBeenCalledTimes(2);
  });

  it('retries a transient evidence failure once for an off', async () => {
    f.record
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue(undefined);
    const response = await post(choice({ choice: 'off' }));
    expect(response.status).toBe(200);
    expect(f.record).toHaveBeenCalledTimes(2);
  });

  it('never answers 200 for an off the ledger refused', async () => {
    f.record.mockRejectedValue(new Error('db'));
    await expect(post(choice({ choice: 'off' }))).rejects.toMatchObject({
      status: 503,
    });
    expect(f.record).toHaveBeenCalledTimes(2);
    // The room already took the off; no on fallback runs for an off.
    expect(choiceCalls()).toHaveLength(1);
  });
});

describe('withdrawal edge cases', () => {
  it('answers 503 for an off whose room answer was unreadable, after recording it', async () => {
    f.room.mockImplementation(
      async (access, command: { action: string; choice?: string }) => {
        if (command.action === 'mira.room.choice' && command.choice === 'off')
          throw new SyntaxError('Unexpected token');
        return roomDefault(access, command);
      }
    );
    await expect(post(choice({ choice: 'off' }))).rejects.toMatchObject({
      status: 503,
    });
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'off' })
    );
  });

  it('does not retry a deterministic refusal of an off, and answers 503', async () => {
    const { MiraChoiceRecordError } =
      await import('../../../../../features/live-assistant/server/room-mira-evidence');
    f.record.mockRejectedValue(new MiraChoiceRecordError('23514'));
    await expect(post(choice({ choice: 'off' }))).rejects.toMatchObject({
      status: 503,
    });
    expect(f.record).toHaveBeenCalledTimes(1);
  });
});

it('(gap c) gives a participant who is not admitted only their own latest choice', async () => {
  const { MeetCallAccessError } =
    await import('@tuturuuu/meet-core/features/call/lib/call-access');
  f.room.mockRejectedValue(new MeetCallAccessError(403, 'Join first'));
  f.openRevision.mockResolvedValue(2);
  f.lastChoice.mockResolvedValue('off');
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({
    available: false,
    joinDefault: true,
    joinRevision: 2,
    joinLastChoice: 'off',
  });
  // The lookup is keyed by the authenticated session, never by the request.
  expect(f.lastChoice).toHaveBeenCalledWith({
    meetingId: 'room',
    participantId: guestAccess.user.id,
    guest: true,
  });
});

it('(gap c) shows the box unticked when the own-choice lookup fails', async () => {
  const { MeetCallAccessError } =
    await import('@tuturuuu/meet-core/features/call/lib/call-access');
  f.room.mockRejectedValue(new MeetCallAccessError(403, 'Join first'));
  f.openRevision.mockResolvedValue(2);
  f.lastChoice.mockResolvedValue(undefined);
  const body = await (
    await GET(new Request('https://meet.test/x'), params)
  ).json();
  // Unknown is not ticked, and no choice is claimed.
  expect(body).toEqual({
    available: false,
    joinDefault: false,
    joinRevision: 2,
  });
});
