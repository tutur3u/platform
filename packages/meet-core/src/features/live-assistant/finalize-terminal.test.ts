import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SavedSession } from '../../cloudflare/live/session-state';

const calls = vi.hoisted(() => ({
  settle: vi.fn(),
  report: vi.fn(),
  room: vi.fn(),
}));
vi.mock('../../cloudflare/live/billing', () => ({
  settleLiveBilling: calls.settle,
}));
vi.mock('../../cloudflare/live/usage-report', () => ({
  reportLiveUsage: calls.report,
}));
vi.mock('../../cloudflare/live/room', () => ({ liveRoomCommand: calls.room }));

import { finalizeSessionBilling } from '../../cloudflare/live/finalize-billing';

function fixture() {
  const saved = {
    claims: { sessionId: 'session', ownerId: 'owner', mode: 'personal' },
    ended: true,
    contextErased: true,
    billingFinalized: true,
    billing: { id: 'bill', settlementComplete: true },
    journal: { turns: [], checkpoints: [] },
    reviews: [],
    publicBillings: {},
  } as unknown as SavedSession;
  let durable = structuredClone(saved);
  const count = { reads: 0, writes: 0, lists: 0, deletes: 0, alarms: 0 };
  const storage = {
    get: vi.fn(async () => {
      count.reads++;
      return structuredClone(durable);
    }),
    put: vi.fn(async (_key: string, value: SavedSession) => {
      count.writes++;
      durable = structuredClone(value);
    }),
    list: vi.fn(async () => {
      count.lists++;
      return new Map();
    }),
    delete: vi.fn(async () => {
      count.deletes++;
    }),
  };
  const persist = () => storage.put('session', saved);
  const retry = async () => {
    count.alarms++;
  };
  const finalize = () =>
    finalizeSessionBilling(
      {} as never,
      saved,
      persist,
      retry,
      storage as unknown as DurableObjectStorage
    );
  return { saved, storage, count, finalize, durable: () => durable };
}
beforeEach(() => {
  vi.resetAllMocks();
  calls.settle.mockImplementation(async (_env, _claims, billing) => ({
    ...billing,
    settlementComplete: true,
  }));
});
it('confirmed completed state performs one read and no writes or I/O across reconstruction', async () => {
  for (let restart = 0; restart < 24; restart++) {
    const f = fixture();
    await f.finalize();
    expect(f.count).toEqual({
      reads: 1,
      writes: 0,
      lists: 0,
      deletes: 0,
      alarms: 0,
    });
    expect(f.durable()).toEqual(f.saved);
  }
  expect(calls.settle).not.toHaveBeenCalled();
  expect(calls.report).not.toHaveBeenCalled();
  expect(calls.room).not.toHaveBeenCalled();
});
it('a missing durable final write cannot be mistaken for acknowledged completion', async () => {
  const f = fixture();
  f.storage.get.mockResolvedValueOnce({ ...f.saved, billingFinalized: false });
  await f.finalize();
  expect(f.count.writes).toBe(2);
  expect(f.durable().billingFinalized).toBe(true);
  expect(calls.report).not.toHaveBeenCalled();
});
it('a receipt for a different session cannot suppress persistence', async () => {
  const f = fixture();
  f.storage.get.mockResolvedValueOnce({
    ...f.saved,
    claims: { ...f.saved.claims, sessionId: 'another-session' },
  });
  await f.finalize();
  expect(f.count.writes).toBe(2);
});
it('a receipt read failure propagates without altering data or claiming completion', async () => {
  const f = fixture();
  f.storage.get.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(f.finalize()).rejects.toThrow('storage unavailable');
  expect(f.count.writes).toBe(0);
  expect(f.durable()).toEqual(f.saved);
});
it('new public billing arriving during receipt lookup remains an obligation', async () => {
  const f = fixture();
  f.storage.get.mockImplementationOnce(async () => {
    const prior = structuredClone(f.saved);
    f.saved.publicBillings = { public: { id: 'public' } as never };
    return prior;
  });
  await f.finalize();
  expect(calls.settle).toHaveBeenCalledOnce();
  expect(calls.report).toHaveBeenCalledOnce();
  expect(f.saved.publicBillings).toEqual({});
});
it('unfinished context erasure still deletes its bounded archive page', async () => {
  const f = fixture();
  f.saved.contextErased = false;
  await f.finalize();
  expect(f.count).toEqual({
    reads: 0,
    writes: 4,
    lists: 1,
    deletes: 1,
    alarms: 0,
  });
  expect(f.durable().contextErased).toBe(true);
});
it('unfinished primary billing still settles and reports before durable finalization', async () => {
  const f = fixture();
  f.saved.billingFinalized = false;
  f.saved.billing!.settlementComplete = false;
  await f.finalize();
  expect(calls.settle).toHaveBeenCalledOnce();
  expect(calls.report).toHaveBeenCalledOnce();
  expect(f.durable().billingFinalized).toBe(true);
});
