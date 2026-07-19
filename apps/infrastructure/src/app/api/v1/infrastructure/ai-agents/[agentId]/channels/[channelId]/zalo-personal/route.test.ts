import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAiAgentZaloPersonalStatus: vi.fn(),
  info: vi.fn(),
  requireAiAgentAdmin: vi.fn(),
  startAiAgentZaloPersonalListener: vi.fn(),
  stopAiAgentZaloPersonalListener: vi.fn(),
  syncAiAgentZaloPersonalHistory: vi.fn(),
  syncAiAgentZaloPersonalPhoneHistory: vi.fn(),
  validateAiAgentZaloPersonalChannel: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/ai-agents/zalo-personal-listeners', () => ({
  getAiAgentZaloPersonalStatus: (
    ...args: Parameters<typeof mocks.getAiAgentZaloPersonalStatus>
  ) => mocks.getAiAgentZaloPersonalStatus(...args),
  startAiAgentZaloPersonalListener: (
    ...args: Parameters<typeof mocks.startAiAgentZaloPersonalListener>
  ) => mocks.startAiAgentZaloPersonalListener(...args),
  stopAiAgentZaloPersonalListener: (
    ...args: Parameters<typeof mocks.stopAiAgentZaloPersonalListener>
  ) => mocks.stopAiAgentZaloPersonalListener(...args),
  syncAiAgentZaloPersonalHistory: (
    ...args: Parameters<typeof mocks.syncAiAgentZaloPersonalHistory>
  ) => mocks.syncAiAgentZaloPersonalHistory(...args),
  syncAiAgentZaloPersonalPhoneHistory: (
    ...args: Parameters<typeof mocks.syncAiAgentZaloPersonalPhoneHistory>
  ) => mocks.syncAiAgentZaloPersonalPhoneHistory(...args),
  validateAiAgentZaloPersonalChannel: (
    ...args: Parameters<typeof mocks.validateAiAgentZaloPersonalChannel>
  ) => mocks.validateAiAgentZaloPersonalChannel(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    info: (...args: Parameters<typeof mocks.info>) => mocks.info(...args),
    warn: (...args: Parameters<typeof mocks.warn>) => mocks.warn(...args),
  },
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock('../../../../access', () => ({
  requireAiAgentAdmin: (
    ...args: Parameters<typeof mocks.requireAiAgentAdmin>
  ) => mocks.requireAiAgentAdmin(...args),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const status = {
  channelId: 'channel-1',
  connected: true,
  enabled: true,
  lastError: null,
  lastEventAt: null,
  mode: 'personal' as const,
  ownId: 'own-1',
  running: true,
  startedAt: '2026-06-11T04:00:00.000Z',
};

const completedPhoneSyncResult = {
  status,
  sync: {
    approvalRequested: true,
    cleaned: true,
    error: null,
    groupMessages: 1,
    pullAttempts: 1,
    requestAccepted: true,
    requestHttpError: null,
    requestViaHttp: false,
    requestViaWebSocket: true,
    status: 'completed' as const,
    synced: 2,
    threads: 2,
    userMessages: 1,
  },
};

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

async function callPost(
  body: Record<string, unknown> = { action: 'sync-phone' }
) {
  const { POST } = await import('./route');
  const request = new Request(
    'http://localhost/api/v1/infrastructure/ai-agents/agent-1/channels/channel-1/zalo-personal',
    {
      body: JSON.stringify(body),
      method: 'POST',
    }
  ) as unknown as NextRequest;
  Object.assign(request, {
    nextUrl: new URL(
      'http://localhost/api/v1/infrastructure/ai-agents/agent-1/channels/channel-1/zalo-personal'
    ),
  });

  return POST(request, {
    params: Promise.resolve({
      agentId: 'agent-1',
      channelId: 'channel-1',
    }),
  });
}

describe('personal Zalo AI-agent route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (
      globalThis as typeof globalThis & {
        __tuturuuuAiAgentZaloPersonalPhoneSyncJobs?: unknown;
      }
    ).__tuturuuuAiAgentZaloPersonalPhoneSyncJobs;

    mocks.getAiAgentZaloPersonalStatus.mockResolvedValue(status);
    mocks.requireAiAgentAdmin.mockResolvedValue({
      ok: true,
      sbAdmin: { id: 'admin-client' },
      user: { id: 'user-1' },
    });
    mocks.syncAiAgentZaloPersonalPhoneHistory.mockResolvedValue(
      completedPhoneSyncResult
    );
  });

  it('returns the running phone-sync job instead of starting duplicate sync requests', async () => {
    const pendingSync = deferred<typeof completedPhoneSyncResult>();
    mocks.syncAiAgentZaloPersonalPhoneHistory.mockReturnValueOnce(
      pendingSync.promise
    );

    const firstResponse = await callPost();
    const secondResponse = await callPost();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(mocks.syncAiAgentZaloPersonalPhoneHistory).toHaveBeenCalledTimes(1);

    const firstPayload = await firstResponse.json();
    const secondPayload = await secondResponse.json();

    expect(firstPayload.phoneSyncJob).toMatchObject({
      completedAt: null,
      error: null,
      status: 'running',
      sync: null,
    });
    expect(secondPayload.phoneSyncJob).toEqual(firstPayload.phoneSyncJob);

    pendingSync.resolve(completedPhoneSyncResult);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('rejects phone sync when the personal Zalo feature is disabled', async () => {
    mocks.getAiAgentZaloPersonalStatus.mockResolvedValue({
      ...status,
      enabled: false,
    });

    const response = await callPost();

    expect(response.status).toBe(400);
    expect(mocks.syncAiAgentZaloPersonalPhoneHistory).not.toHaveBeenCalled();
  });

  it('aborts a running phone sync instead of leaving background pulls active', async () => {
    const pendingSync = deferred<typeof completedPhoneSyncResult>();
    mocks.syncAiAgentZaloPersonalPhoneHistory.mockReturnValueOnce(
      pendingSync.promise
    );

    await callPost();
    const syncInput =
      mocks.syncAiAgentZaloPersonalPhoneHistory.mock.calls[0]?.[0];
    expect(syncInput?.options?.signal.aborted).toBe(false);

    const cancelResponse = await callPost({ action: 'cancel-sync-phone' });
    const cancelPayload = await cancelResponse.json();

    expect(cancelResponse.status).toBe(200);
    expect(syncInput?.options?.signal.aborted).toBe(true);
    expect(cancelPayload.phoneSyncJob).toMatchObject({
      error: 'zalo_personal_phone_sync_cancelled',
      status: 'failed',
    });

    pendingSync.resolve(completedPhoneSyncResult);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
