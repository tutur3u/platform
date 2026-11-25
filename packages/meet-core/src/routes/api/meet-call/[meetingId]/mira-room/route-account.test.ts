import { createHash } from 'node:crypto';
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
  checkTranslation: vi.fn(),
  cf: vi.fn(),
  stopPrivate: vi.fn(),
  access: { guest: true, userId: '' },
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale }: { locale: 'en' | 'vi' }) => {
    f.checkTranslation();
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

import {
  MIRA_PRIVATE_NOTICE_VERSION,
  MIRA_ROOM_NOTICE_VERSION as version,
} from '@tuturuuu/realtime/meet';
import { GET, POST } from './route';

const params = { params: Promise.resolve({ meetingId: 'room' }) };
const post = (body: unknown, context = params) =>
  POST(
    new Request('https://meet.test/mira-room', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    context
  );
const read = { version, choice: null, acceptance: null, ready: false };
const PENDING = '0b1e0d1c-2f3a-4b5c-8d6e-7f8091a2b3c4';
/** The room holds every on as pending and answers its id; else the view. */
const roomDefault = async (
  _access: unknown,
  command: { action: string; choice?: string }
) => {
  if (command.action === 'mira.private.read')
    return {
      version: MIRA_PRIVATE_NOTICE_VERSION,
      admitted: true,
      choice: null,
      sessions: [],
    };
  return command.action === 'mira.room.choice' && command.choice === 'on'
    ? { pendingId: PENDING, pendingUntil: Date.now() + 20_000, view: read }
    : read;
};
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

describe('account confirmation in the redesigned Meet flow', () => {
  const key = 'meet_mira_account_confirmation';
  const accountVersion = '2026-11-25-v1';
  const marker = { [key]: accountVersion };
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const reply = (app_metadata: Record<string, unknown>) => ({
    data: { user: { id: f.access.userId, app_metadata } },
  });
  const confirmedRoom = {
    ...read,
    lastChoice: null,
    acceptance: {
      revision: 1,
      acceptorName: 'Lan',
      accountConfirmationRequired: true,
    },
  };
  const autoOn = () =>
    choice({
      source: 'auto_on',
      expectedActorId: f.access.userId,
      textHash: hash('Mira is on, turned on by Lan'),
      locale: 'en',
    });

  beforeEach(() => {
    vi.stubEnv('MEET_UX_V2', 'true');
    f.access.guest = false;
    f.access.userId = crypto.randomUUID();
    f.getUserById.mockResolvedValue(reply({}));
  });

  it('refuses an on for an unconfirmed account before touching the room', async () => {
    await expect(post(autoOn())).rejects.toMatchObject({
      status: 403,
      code: 'MIRA_ACCOUNT_CONFIRMATION_REQUIRED',
    });
    expect(f.room).not.toHaveBeenCalled();
    expect(f.record).not.toHaveBeenCalled();
  });

  it('refuses automatic on when the durable meeting choice was off', async () => {
    f.getUserById.mockResolvedValue(reply(marker));
    f.lastChoice.mockResolvedValue('off');
    await expect(
      post(autoOn(), { params: Promise.resolve({ meetingId: 'room-alias' }) })
    ).rejects.toMatchObject({
      status: 409,
      code: 'MIRA_ROOM_JOIN_OVER_OFF',
    });
    expect(f.lastChoice).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 'room' })
    );
    expect(f.room).not.toHaveBeenCalled();
  });

  it('records the localized auto-on evidence for the current account before confirming', async () => {
    f.getUserById.mockResolvedValue(reply(marker));
    f.room.mockImplementation(async (access, command: { action: string }) =>
      command.action === 'mira.room.read'
        ? confirmedRoom
        : roomDefault(access, command)
    );
    const input = autoOn();
    expect((await post(input)).status).toBe(200);
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({
        choice: 'on',
        source: 'auto_on',
        meetingId: 'room',
        participantId: f.access.userId,
        acceptanceRevision: 1,
        textHash: input.textHash,
        locale: 'en',
        pendingId: PENDING,
      })
    );
    const confirmIndex = f.room.mock.calls.findIndex(
      ([, command]) => command.action === 'mira.room.confirm'
    );
    const confirmOrder = f.room.mock.invocationCallOrder[confirmIndex];
    expect(f.record.mock.invocationCallOrder[0]).toBeLessThan(confirmOrder ?? -1);

    f.record.mockClear();
    await expect(post({ ...input, textHash: 'b'.repeat(64) })).rejects.toMatchObject({
      status: 409,
      code: 'mira_notice_required',
    });
    expect(f.record).not.toHaveBeenCalled();
  });

  it('writes one structured marker for the authenticated actor and evicts it on withdrawal', async () => {
    const actor = f.access.userId;
    const action = { action: 'confirm_account', expectedActorId: actor, locale: 'vi' };
    f.updateUserById.mockImplementation(async (_id, { app_metadata }) => {
      const result = reply(app_metadata[key] === null ? {} : app_metadata);
      f.getUserById.mockResolvedValue(result);
      return result;
    });
    await expect(post({ ...action, expectedActorId: PENDING })).rejects.toMatchObject({
      status: 403,
    });
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(await (await post(action)).json()).toMatchObject({
      accountConfirmation: 'confirmed',
    });
    expect(await (await post(action)).json()).toMatchObject({
      accountConfirmation: 'confirmed',
    });
    expect(f.updateUserById).toHaveBeenCalledOnce();
    expect(f.updateUserById).toHaveBeenCalledWith(actor, {
      app_metadata: {
        [key]: {
          version: accountVersion,
          confirmedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.+Z$/),
          locale: 'vi',
          textHash: '3a43d3691dcc721785bff9132cec51e2ea5716931a1a32a3daea03489398d69a',
        },
      },
    });

    const withdraw = { ...action, action: 'withdraw_account' };
    await expect(post({ ...withdraw, expectedActorId: PENDING })).rejects.toMatchObject({
      status: 403,
    });
    expect(f.updateUserById).toHaveBeenCalledOnce();
    expect(await (await post(withdraw)).json()).toMatchObject({
      accountConfirmation: 'required',
    });
    expect(f.updateUserById).toHaveBeenLastCalledWith(actor, {
      app_metadata: { [key]: null },
    });
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'off', participantId: actor })
    );
    await expect(post(autoOn())).rejects.toMatchObject({
      status: 403,
      code: 'MIRA_ACCOUNT_CONFIRMATION_REQUIRED',
    });
  });

  it('caches the active room ledger fallback and invalidates it after the caller chooses', async () => {
    f.getUserById.mockResolvedValue(reply(marker));
    f.room.mockImplementation(async (access, command: { action: string }) =>
      command.action === 'mira.room.read'
        ? confirmedRoom
        : roomDefault(access, command)
    );
    const get = () => GET(new Request('https://meet.test/x'), params);
    await get();
    await get();
    expect(f.lastChoice).toHaveBeenCalledOnce();

    f.lastChoice.mockResolvedValue('off');
    const response = await post(choice({ choice: 'off', source: 'toggle' }));
    expect(await response.json()).toMatchObject({ lastChoice: 'off' });
    expect(f.lastChoice).toHaveBeenCalledTimes(2);
  });

  const withdrawAccount = () => ({
    action: 'withdraw_account',
    expectedActorId: f.access.userId,
    locale: 'en',
  });

  it('prepares the withdrawal evidence before either write', async () => {
    f.checkTranslation.mockImplementationOnce(() => {
      throw new Error('Translation unavailable');
    });
    await expect(post(withdrawAccount())).rejects.toThrow(
      'Translation unavailable'
    );
    expect(f.room).not.toHaveBeenCalled();
    expect(f.record).not.toHaveBeenCalled();
    expect(f.updateUserById).not.toHaveBeenCalled();
  });

  it('keeps the Auth marker when room off fails', async () => {
    f.getUserById.mockResolvedValue(reply(marker));
    f.room.mockRejectedValue(undefined);
    await expect(post(withdrawAccount())).rejects.toMatchObject({ status: 503 });
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.stopPrivate).not.toHaveBeenCalled();
  });

  it('keeps the room off and permits retry if marker removal fails', async () => {
    let roomChoice: 'on' | 'off' = 'on';
    let appMetadata: Record<string, unknown> = marker;
    f.getUserById.mockImplementation(async () => reply(appMetadata));
    f.updateUserById
      .mockRejectedValueOnce(new Error('Auth unavailable'))
      .mockImplementation(async () => {
        appMetadata = {};
        return reply(appMetadata);
      });
    f.room.mockImplementation(
      async (_access, command: { action: string; choice?: string }) => {
        if (command.action === 'mira.room.choice' && command.choice === 'off')
          roomChoice = 'off';
        if (command.action === 'mira.private.read')
          return {
            version: MIRA_PRIVATE_NOTICE_VERSION,
            admitted: true,
            choice: null,
            sessions: [PENDING],
          };
        return { ...confirmedRoom, choice: roomChoice, lastChoice: roomChoice };
      }
    );
    f.cf.mockResolvedValue({
      env: {
        MEET_LIVE: {
          idFromName: (id: string) => id,
          get: () => ({ fetch: f.stopPrivate }),
        },
      },
    });
    f.stopPrivate.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(post(withdrawAccount())).rejects.toMatchObject({
      status: 503,
      code: 'withdraw_incomplete',
    });
    expect(roomChoice).toBe('off');
    expect(appMetadata).toEqual(marker);
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'off', meetingId: 'room' })
    );

    const response = await post(withdrawAccount());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accountConfirmation: 'required',
      choice: 'off',
    });
    expect(f.stopPrivate).toHaveBeenCalledWith('https://live.internal/control', {
      method: 'POST',
      body: JSON.stringify({
        action: 'stop',
        ownerId: f.access.userId,
        meetingId: 'room',
      }),
    });
    expect(f.room).toHaveBeenCalledWith(expect.anything(), {
      action: 'mira.private.ended',
      sessionId: PENDING,
    });
  });

  it.each(['confirm', 'toggle', 'auto_on'])(
    'refuses on from %s under a live unmarked acceptance',
    async (source) => {
      f.getUserById.mockResolvedValue(reply(marker));
      f.room.mockResolvedValue({
        ...confirmedRoom,
        acceptance: { revision: 1, acceptorName: 'Host' },
      });
      await expect(
        post(choice({ source, expectedActorId: f.access.userId }))
      ).rejects.toMatchObject({ status: 409, code: 'MIRA_ROOM_STALE' });
      expect(f.room).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
        action: 'mira.room.read',
      });
      expect(f.record).not.toHaveBeenCalled();
    }
  );
});
