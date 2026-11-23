import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  available: vi.fn(),
  room: vi.fn(),
  role: vi.fn(),
  record: vi.fn(),
  end: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./room-mira-authority', () => ({
  readRoomMiraAvailability: f.available,
}));
vi.mock('./room-mira-evidence', () => ({
  recordMiraAcceptance: f.record,
  endMiraAcceptance: f.end,
}));
vi.mock('../../call/server/class-role', () => ({
  resolveMeetClassRole: f.role,
}));
vi.mock('../../call/server/room-service', () => ({ callRoomService: f.room }));
vi.mock('../../call/lib/call-access', () => ({
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

import { acceptRoomMira, endRoomMira } from './room-mira-acceptance';

const host = {
  user: { id: 'host' },
  meeting: { id: 'meeting', ws_id: 'ws' },
  isHost: true,
  canReadWorkspace: true,
} as never;
const guest = {
  user: { id: 'guest-id' },
  guest: true,
  meeting: { id: 'meeting', ws_id: 'ws' },
  isHost: false,
  canReadWorkspace: false,
} as never;

beforeEach(() => {
  vi.resetAllMocks();
  f.available.mockResolvedValue(true);
  f.role.mockResolvedValue({ coHost: false });
  f.record.mockResolvedValue(4);
  f.end.mockResolvedValue(undefined);
  f.room.mockImplementation(async (_access, command: { action: string }) =>
    command.action === 'mira.room.read'
      ? { canAccept: true }
      : { revision: 4, acceptorName: 'Host', replacedRevision: null }
  );
});

it('never lets a guest accept and needs the workspace 18+ declaration', async () => {
  await expect(acceptRoomMira(guest, ['chat'])).rejects.toMatchObject({
    status: 403,
  });
  f.available.mockResolvedValue(false);
  await expect(acceptRoomMira(host, ['chat'])).rejects.toMatchObject({
    status: 403,
    code: 'MIRA_WORKSPACE_UNAVAILABLE',
  });
  expect(f.record).not.toHaveBeenCalled();
});

it('refuses before allocating a revision when the room says the caller cannot accept', async () => {
  f.room.mockResolvedValue({ canAccept: false });
  await expect(acceptRoomMira(host, ['chat'])).rejects.toMatchObject({
    status: 403,
  });
  expect(f.record).not.toHaveBeenCalled();
});

it('allocates the revision durably, then applies it in the room with the co-host scope', async () => {
  f.role.mockResolvedValue({ coHost: true });
  await acceptRoomMira(host, ['chat', 'captions']);
  expect(f.record).toHaveBeenCalledWith(
    expect.objectContaining({
      meetingId: 'meeting',
      userId: 'host',
      capabilities: ['chat', 'captions'],
    })
  );
  expect(f.room).toHaveBeenLastCalledWith(
    host,
    expect.objectContaining({
      action: 'mira.room.accept',
      revision: 4,
      audienceAdultConfirmed: true,
    }),
    { coHost: true }
  );
});

it('keeps Mira off with a 503 when the acceptance cannot be recorded', async () => {
  f.record.mockRejectedValue(new Error('missing relation'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(acceptRoomMira(host, ['chat'])).rejects.toMatchObject({
    status: 503,
    code: 'MIRA_EVIDENCE_UNAVAILABLE',
  });
  expect(f.room).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'mira.room.accept' }),
    expect.anything()
  );
  expect(f.end).not.toHaveBeenCalled();
});

it('ends a revision the room refused as not applied', async () => {
  f.room.mockImplementation(async (_access, command: { action: string }) => {
    if (command.action === 'mira.room.read') return { canAccept: true };
    throw new Error('refused');
  });
  await expect(acceptRoomMira(host, ['chat'])).rejects.toThrow('refused');
  expect(f.end).toHaveBeenCalledWith(
    expect.objectContaining({ revision: 4, reason: 'not_applied' })
  );
});

it('records a replaced acceptance as expanded', async () => {
  f.room.mockImplementation(async (_access, command: { action: string }) =>
    command.action === 'mira.room.read'
      ? { canAccept: true }
      : { revision: 4, acceptorName: 'Host', replacedRevision: 3 }
  );
  await acceptRoomMira(host, ['chat', 'notes']);
  expect(f.end).toHaveBeenCalledWith(
    expect.objectContaining({ revision: 3, reason: 'expanded' })
  );
});

it('lets a guest report a minor and records the end without an account', async () => {
  f.room.mockResolvedValue({ endedRevision: 4 });
  await endRoomMira(guest, 'minor_reported');
  expect(f.room).toHaveBeenCalledWith(
    guest,
    { action: 'mira.room.end', reason: 'minor_reported' },
    {}
  );
  expect(f.end).toHaveBeenCalledWith({
    meetingId: 'meeting',
    revision: 4,
    userId: null,
    reason: 'minor_reported',
  });
});
