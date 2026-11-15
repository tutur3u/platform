import { afterEach, expect, it, vi } from 'vitest';
import {
  syncZaloPersonalWebHistory,
  type ZaloPersonalWebSyncOptions,
  type ZaloPersonalWebSyncResult,
} from './zalo-personal-web-sync';
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('./zalo-personal-web-sync.node', () => ({
  executeZaloPersonalWebHistory: execute,
}));
const options: ZaloPersonalWebSyncOptions = {
  agentId: 'fixture-agent',
  channelId: 'fixture-channel',
  channelDisplayName: 'fixture',
  cookieJson: 'fixture-cookie',
  imei: 'fixture-device',
  userAgent: 'fixture-browser',
  syncTimeoutMs: 100_000,
};
const result: ZaloPersonalWebSyncResult = {
  approvalRequested: false,
  conversations: 1,
  error: null,
  groupMessages: 0,
  messages: [],
  missingRanges: 0,
  requestAccepted: true,
  status: 'completed',
  threads: [],
  userMessages: 0,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('keeps Node execution synchronous with the same inputs and result', async () => {
  execute.mockResolvedValue(result);
  expect(await syncZaloPersonalWebHistory(options)).toBe(result);
  expect(execute).toHaveBeenCalledWith(options);
});
it('Worker only enqueues identifiers and awaits the result without launching a browser', async () => {
  vi.stubGlobal('WebSocketPair', class {});
  const enqueueAndWait = vi.fn(async () => result);
  expect(await syncZaloPersonalWebHistory(options, { enqueueAndWait })).toBe(
    result
  );
  expect(enqueueAndWait).toHaveBeenCalledExactlyOnceWith({
    kind: 'zalo-personal-web-sync',
    agentId: options.agentId,
    channelId: options.channelId,
    syncTimeoutMs: 100_000,
  });
  expect(execute).not.toHaveBeenCalled();
});
it('fails closed on Worker without a queue', async () => {
  vi.stubGlobal('WebSocketPair', class {});
  await expect(syncZaloPersonalWebHistory(options)).rejects.toThrow(
    'not configured'
  );
  expect(execute).not.toHaveBeenCalled();
});
it('propagates unknown queue outcomes without retrying', async () => {
  const enqueueAndWait = vi.fn(async () => {
    throw new Error('unknown outcome');
  });
  await expect(
    syncZaloPersonalWebHistory(options, { enqueueAndWait })
  ).rejects.toThrow('unknown outcome');
  expect(enqueueAndWait).toHaveBeenCalledOnce();
  expect(execute).not.toHaveBeenCalled();
});

it('off-Worker runner resolves an authorized session before executing the browser', async () => {
  const { runZaloWebSyncJob } = await import('./zalo-personal-web-sync.runner');
  execute.mockResolvedValue(result);
  const job = {
    kind: 'zalo-personal-web-sync' as const,
    agentId: options.agentId,
    channelId: options.channelId,
    syncTimeoutMs: 100_000,
  };
  const resolve = vi.fn(async () => options);
  expect(await runZaloWebSyncJob(job, resolve)).toBe(result);
  expect(resolve).toHaveBeenCalledExactlyOnceWith(job);
  expect(execute).toHaveBeenCalledExactlyOnceWith(options);
});
it('off-Worker runner refuses a mismatched session identity', async () => {
  const { runZaloWebSyncJob } = await import('./zalo-personal-web-sync.runner');
  await expect(
    runZaloWebSyncJob(
      {
        kind: 'zalo-personal-web-sync',
        agentId: 'different-agent',
        channelId: options.channelId,
      },
      async () => options
    )
  ).rejects.toThrow('identity mismatch');
  expect(execute).not.toHaveBeenCalled();
});

it.each([0, -1, NaN, Infinity, 120_001])(
  'rejects an invalid queued timeout %s before resolving secrets',
  async (syncTimeoutMs) => {
    const { runZaloWebSyncJob } =
      await import('./zalo-personal-web-sync.runner');
    const resolve = vi.fn(async () => options);
    await expect(
      runZaloWebSyncJob(
        {
          kind: 'zalo-personal-web-sync',
          agentId: options.agentId,
          channelId: options.channelId,
          syncTimeoutMs,
        },
        resolve
      )
    ).rejects.toThrow('Invalid browser sync job');
    expect(resolve).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  }
);

vi.mock('server-only', () => ({}));
