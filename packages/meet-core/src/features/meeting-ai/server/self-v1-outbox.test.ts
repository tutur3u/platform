import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ack: vi.fn(),
  roomEnd: vi.fn(),
  rpc: {
    recordDecision: vi.fn(),
    closeStream: vi.fn(),
    revokeUpload: vi.fn(),
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('./self-v1-room', () => ({ selfRoomCommands: { ack: mocks.ack } }));
vi.mock('./self-v1-room-end', () => ({
  settleRoomEnds: (...args: unknown[]) => mocks.roomEnd(...args),
}));
vi.mock('./self-v1-rpc', async (original) => ({
  ...(await original<object>()),
  selfRpc: mocks.rpc,
}));

import { drainSelfOutbox } from './self-v1-outbox';
import { MeetSelfRpcError } from './self-v1-rpc';

const sessionId = '00000000-0000-4000-8000-0000000000cc';
const otherSession = '00000000-0000-4000-8000-0000000000c2';
const a = '00000000-0000-4000-8000-0000000000a1';
const b = '00000000-0000-4000-8000-0000000000a2';
const room = { access: {}, accountId: a } as never;
const entry = (
  accountId: string,
  seq: number,
  kind: string,
  sid = sessionId
) => ({
  sessionId: sid,
  accountId,
  seq,
  kind,
});

describe('self_v1 legal outbox drain', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.roomEnd.mockImplementation(async (_db, settled) => settled);
    mocks.rpc.recordDecision.mockResolvedValue({ revision: 2, recorded: true });
    mocks.rpc.closeStream.mockResolvedValue(true);
    mocks.rpc.revokeUpload.mockResolvedValue(true);
  });

  it('writes each account in room sequence order, then acknowledges', async () => {
    const order: string[] = [];
    mocks.rpc.recordDecision.mockImplementation(async (_db, input) => {
      order.push(`withdraw:${input.roomSeq}`);
      return { revision: 1, recorded: true };
    });
    mocks.rpc.closeStream.mockImplementation(async (_db, input) => {
      order.push(`close:${input.roomSeq}`);
      return true;
    });
    await drainSelfOutbox({} as never, room, sessionId, [
      entry(a, 7, 'close'),
      entry(a, 5, 'withdraw'),
      entry(b, 2, 'revoke'),
    ]);
    expect(order).toEqual(['withdraw:5', 'close:7']);
    expect(mocks.rpc.revokeUpload).toHaveBeenCalledWith(
      {},
      { sessionId, accountId: b, roomSeq: 2 }
    );
    expect(mocks.ack.mock.calls[0]?.[2]).toEqual(
      expect.arrayContaining([
        { accountId: a, seq: 5 },
        { accountId: a, seq: 7 },
        { accountId: b, seq: 2 },
      ])
    );
  });

  it('treats duplicates and superseded entries as recorded', async () => {
    mocks.rpc.recordDecision.mockResolvedValue({
      revision: 3,
      recorded: false,
    });
    mocks.rpc.closeStream.mockRejectedValue(
      new MeetSelfRpcError(409, 'stale', '40001')
    );
    await drainSelfOutbox({} as never, room, sessionId, [
      entry(a, 5, 'withdraw'),
      entry(a, 6, 'close'),
    ]);
    expect(mocks.ack.mock.calls[0]?.[2]).toHaveLength(2);
  });

  it('acknowledges no-op writes for a deleted or fenced account', async () => {
    mocks.rpc.recordDecision.mockResolvedValue({
      revision: 1,
      recorded: false,
    });
    mocks.rpc.revokeUpload.mockResolvedValue(false);
    mocks.rpc.closeStream.mockResolvedValue(false);
    await drainSelfOutbox({} as never, room, sessionId, [
      entry(a, 5, 'withdraw'),
      entry(a, 6, 'revoke'),
      entry(a, 7, 'close'),
    ]);
    expect(mocks.ack.mock.calls[0]?.[2]).toEqual([
      { accountId: a, seq: 5 },
      { accountId: a, seq: 6 },
      { accountId: a, seq: 7 },
    ]);
  });

  it('keeps later entries of an account pending after a failure', async () => {
    mocks.rpc.recordDecision.mockRejectedValue(
      new MeetSelfRpcError(503, 'down', '')
    );
    await expect(
      drainSelfOutbox({} as never, room, sessionId, [
        entry(a, 5, 'withdraw'),
        entry(a, 6, 'close'),
        entry(b, 1, 'close'),
      ])
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.rpc.closeStream).toHaveBeenCalledTimes(1);
    expect(mocks.ack.mock.calls[0]?.[2]).toEqual([{ accountId: b, seq: 1 }]);
  });

  it('ignores entries for other sessions and malformed entries', async () => {
    await drainSelfOutbox({} as never, room, sessionId, [
      entry(a, 5, 'withdraw', otherSession),
      { sessionId, accountId: a, seq: 0, kind: 'withdraw' },
      { sessionId, accountId: a, seq: 3, kind: 'allow' },
    ]);
    expect(mocks.rpc.recordDecision).not.toHaveBeenCalled();
    expect(mocks.ack).not.toHaveBeenCalled();
  });

  it('holds a close back while its room-ended session stop is pending', async () => {
    mocks.roomEnd.mockImplementation(async (_db, settled) =>
      settled.filter((item: { kind: string }) => item.kind !== 'close')
    );
    await expect(
      drainSelfOutbox({} as never, room, sessionId, [
        entry(a, 5, 'withdraw'),
        entry(b, 1, 'close'),
      ])
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.ack.mock.calls[0]?.[2]).toEqual([{ accountId: a, seq: 5 }]);
  });

  it('retries a stale revoke but settles a missing session', async () => {
    mocks.rpc.revokeUpload.mockRejectedValue(
      new MeetSelfRpcError(409, 'stale', '40001')
    );
    mocks.rpc.closeStream.mockRejectedValue(
      new MeetSelfRpcError(404, 'gone', 'P0002')
    );
    await expect(
      drainSelfOutbox({} as never, room, sessionId, [
        entry(a, 2, 'revoke'),
        entry(b, 1, 'close'),
      ])
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.ack.mock.calls[0]?.[2]).toEqual([{ accountId: b, seq: 1 }]);
  });
});
