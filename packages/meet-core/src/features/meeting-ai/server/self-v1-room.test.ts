import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ room: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('../../call/lib/call-access', () => ({ getMeetCallAccess: vi.fn() }));
vi.mock('../../call/server/room-service', () => ({
  callRoomService: mocks.room,
}));

import { selfRoomCommands } from './self-v1-room';

const room = { access: {} as never, accountId: 'u' };
const sessionId = '00000000-0000-4000-8000-0000000000cc';
const pending = [{ sessionId, accountId: 'u', seq: 4, kind: 'withdraw' }];
const failWith = (status: number, code?: string) =>
  mocks.room.mockRejectedValue(
    Object.assign(new Error('x'), { status, code })
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe('self_v1 room replies', () => {
  it('passes an open refusal through with its pending entries', async () => {
    mocks.room.mockResolvedValue({
      allowed: false,
      reason: 'revoked',
      pending,
    });
    expect(await selfRoomCommands.openBegin(room, sessionId)).toEqual({
      allowed: false,
      reason: 'revoked',
      pending,
    });
  });

  it('returns the allow sequence and notice version of an allowed open', async () => {
    mocks.room.mockResolvedValue({
      allowed: true,
      epoch: 2,
      allowSeq: 5,
      generation: 1,
      noticeVersion: 'notice-room',
      pending: [],
    });
    expect(await selfRoomCommands.openBegin(room, sessionId)).toEqual({
      allowed: true,
      epoch: 2,
      allowSeq: 5,
      noticeVersion: 'notice-room',
      pending: [],
    });
  });

  it('returns the notice evidence the room holds for the allow', async () => {
    mocks.room.mockResolvedValue({
      allowed: true,
      epoch: 2,
      allowSeq: 5,
      noticeVersion: 'notice-room',
      locale: 'vi',
      textHash: 'b'.repeat(64),
      pending: [],
    });
    expect(await selfRoomCommands.openBegin(room, sessionId)).toMatchObject({
      evidence: { locale: 'vi', textHash: 'b'.repeat(64) },
    });
  });

  it('drops malformed notice evidence', async () => {
    mocks.room.mockResolvedValue({
      allowed: true,
      epoch: 2,
      allowSeq: 5,
      noticeVersion: 'notice-room',
      locale: 'Vietnamese',
      textHash: 'nope',
    });
    expect(
      (await selfRoomCommands.openBegin(room, sessionId)).evidence
    ).toBeUndefined();
  });

  it('refuses an allowed open without a notice version', async () => {
    mocks.room.mockResolvedValue({ allowed: true, epoch: 2, allowSeq: 5 });
    await expect(
      selfRoomCommands.openBegin(room, sessionId)
    ).rejects.toMatchObject({ status: 503, code: 'MEET_SELF_UNAVAILABLE' });
  });

  it('treats a missing committed flag as a refused commit', async () => {
    mocks.room.mockResolvedValue({ pending });
    expect(
      await selfRoomCommands.openCommit(room, {
        sessionId,
        epoch: 1,
        revision: 1,
        streamId: sessionId,
      })
    ).toEqual({ committed: false, pending });
  });

  it('keeps pending entries on a refused authorize', async () => {
    mocks.room.mockResolvedValue({ allowed: false, reason: 'stream', pending });
    expect(
      await selfRoomCommands.authorize(room, {
        sessionId,
        streamId: sessionId,
        consentRevision: 1,
        spend: true,
      })
    ).toEqual({ allowed: false, reason: 'stream', pending });
  });
});

describe('capture mode refusals', () => {
  it.each([
    [409, 409, 'MEET_SELF_MODE_LOCKED'],
    [412, 409, 'MEET_SELF_UNAVAILABLE'],
    [403, 403, undefined],
    [500, 503, 'MEET_SELF_UNAVAILABLE'],
  ])('maps room %i to %i %s', async (roomStatus, status, code) => {
    failWith(roomStatus);
    await expect(
      selfRoomCommands.setMode(room, 'self', { coHost: false })
    ).rejects.toMatchObject({ status, code });
  });
});

describe('session record refusals', () => {
  it.each([
    [409, 409, 'MEET_SELF_PROTOCOL_MISMATCH'],
    [409, 409, 'MEET_SELF_SESSION_LIVE', 'MEET_SELF_SESSION_LIVE'],
    [409, 409, 'MEET_SELF_SESSION_ENDED', 'MEET_SELF_SESSION_ENDED'],
    [412, 409, 'MEET_SELF_UNAVAILABLE'],
    [403, 403, undefined],
  ] as Array<[number, number, string | undefined, string?]>)(
    'maps room %i to %i %s',
    async (roomStatus, status, code, roomCode) => {
    failWith(roomStatus, roomCode);
    await expect(
      selfRoomCommands.recordSession(room, {
        sessionId,
        active: true,
        generation: 1,
      })
    ).rejects.toMatchObject({ status, code });
    }
  );
});

describe('notice refusals from the room', () => {
  it.each([
    [400, 'MEET_SELF_NOTICE_REQUIRED', 400],
    [409, 'MEET_SELF_NOTICE_STALE', 409],
  ])('keeps room %i %s as a fixed client code', async (roomStatus, code, status) => {
    const { selfRoomError } = await import('./self-v1-room');
    expect(
      selfRoomError(Object.assign(new Error('x'), { status: roomStatus, code }))
    ).toMatchObject({ status, code });
  });
});
