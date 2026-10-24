import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevboxesClient } from '../platform-devbox';
import { offloadRun } from './resources';
import * as box from './resources-box-offload';

const options = {
  runnerId: 'trusted-1',
  sha: 'a'.repeat(40),
  prefix: '',
  argv: ['true'],
  timeoutSeconds: 60,
  pollMs: 1,
  write: () => {},
  log: () => {},
};
function fixture() {
  const devboxes = {
    createRun: vi.fn(
      async (): Promise<unknown> => ({ run: { id: 'run-1', status: 'queued' } })
    ),
    getRun: vi.fn(async () => ({
      run: { id: 'run-1', status: 'succeeded', exitCode: 0 },
    })),
    getRunLogs: vi.fn(
      async (): Promise<{ logs: string[]; next: number }> => ({
        logs: [],
        next: 0,
      })
    ),
    stopRun: vi.fn(async () => ({ message: 'stopped' })),
    fleet: {
      snapshot: vi.fn(async () => ({ runners: [], runs: [], leases: [] })),
    },
  };
  const client = { devboxes } as never;
  const run = (overrides: Partial<typeof box> = {}) =>
    offloadRun({
      home: '/unused',
      lanes: 1,
      target: 'auto',
      argv: ['true'],
      queueStatus: (async () => ({
        occupied: 1,
        effectiveLanes: 1,
        waiting: [],
      })) as never,
      loadBox: async () => ({
        ...box,
        offloadCommitPlan: () => ({ sha: options.sha, prefix: '' }),
        createSessionClient: async () => client,
        selectOffloadRunner: () => ({ runner: { id: 'trusted-1' } }) as never,
        runBoxOffload: (args) => box.runBoxOffload({ ...args, ...options }),
        ...overrides,
      }),
    });
  return { client, devboxes, run };
}
function interrupt(signal: 'SIGINT' | 'SIGTERM') {
  // Invoke only the operation's handler, never signal the test runner itself.
  const handler = process.listeners(signal).at(-1);
  if (!handler) throw new Error('missing offload signal handler');
  handler(signal);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('creation cancellation is terminal (REV-6454-4)', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    '%s followed by a 403 never queues locally',
    async (signal) => {
      const { devboxes, run } = fixture();
      devboxes.createRun.mockImplementation(async () => {
        interrupt(signal);
        throw Object.assign(new Error('forbidden'), { status: 403 });
      });
      await expect(run()).resolves.toBe(signal === 'SIGINT' ? 130 : 143);
      expect(devboxes.createRun).toHaveBeenCalledTimes(1);
      expect(devboxes.stopRun).not.toHaveBeenCalled();
    }
  );
  it.each(['SIGINT', 'SIGTERM'] as const)(
    '%s survives malformed or lost creation acknowledgements',
    async (signal) => {
      for (const result of ['malformed', 'lost', 'terminal'] as const) {
        const { devboxes, run } = fixture();
        devboxes.createRun.mockImplementation(async () => {
          interrupt(signal);
          if (result === 'lost') throw new Error('connection lost');
          return result === 'malformed'
            ? {}
            : { run: { id: 'run-1', status: 'succeeded', exitCode: 0 } };
        });
        await expect(run()).resolves.toBe(signal === 'SIGINT' ? 130 : 143);
        expect(devboxes.getRunLogs).not.toHaveBeenCalled();
        if (result === 'terminal')
          expect(devboxes.stopRun).toHaveBeenCalledOnce();
      }
    }
  );
});

describe('remote creation boundary (REV-6454-5)', () => {
  it.each([{}, { run: { id: 'run-1' } }])(
    'malformed acknowledgement %j never queues locally',
    async (ack) => {
      const { devboxes, run } = fixture();
      devboxes.createRun.mockResolvedValue(ack);
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      await expect(run()).resolves.toBe(1);
      if ('run' in ack)
        expect(devboxes.stopRun).toHaveBeenCalledWith('run-1', {
          signal: expect.any(AbortSignal),
        });
      else expect(devboxes.stopRun).not.toHaveBeenCalled();
    }
  );
  it('unexpected adapter failure after entering creation never queues locally', async () => {
    const { run } = fixture();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await expect(
      run({
        runBoxOffload: async () => {
          throw new Error('bad acknowledgement');
        },
      })
    ).resolves.toBe(1);
  });
  it('pre-creation selection failure may still queue locally', async () => {
    const { devboxes, run } = fixture();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await expect(
      run({
        selectOffloadRunner: () => {
          throw new Error('fleet unavailable');
        },
      })
    ).resolves.toBeUndefined();
    expect(devboxes.createRun).not.toHaveBeenCalled();
  });
});

describe('bounded control plane and log paging (REV-6454-6)', () => {
  it('bounds a stalled log page, aborts requests, and stops without local replay', async () => {
    vi.useFakeTimers();
    const { client, devboxes } = fixture();
    devboxes.getRunLogs.mockImplementation(() => new Promise(() => {}));
    let settled = false;
    const result = box.runBoxOffload({ client, ...options }).then((code) => {
      settled = true;
      return code;
    });
    await vi.advanceTimersByTimeAsync(76_000);
    expect(settled).toBe(true);
    expect(await result).toBe(1);
    expect(devboxes.getRunLogs).toHaveBeenCalledTimes(5);
    expect(devboxes.stopRun).toHaveBeenCalledOnce();
    for (const call of devboxes.getRunLogs.mock.calls) {
      expect(
        (call as unknown as [string, { signal: AbortSignal }])[1].signal.aborted
      ).toBe(true);
    }
  });
  it.each(['interrupt', 'deadline'] as const)(
    'checks %s between full pages',
    async (reason) => {
      vi.useFakeTimers();
      const { client, devboxes } = fixture();
      devboxes.getRunLogs.mockImplementation(async () => {
        if (reason === 'interrupt') interrupt('SIGTERM');
        else vi.setSystemTime(Date.now() + 121_000);
        return { logs: Array.from({ length: 1000 }, () => 'line'), next: 1000 };
      });
      const result = box.runBoxOffload({ client, ...options });
      await vi.advanceTimersByTimeAsync(0);
      expect(await result).toBe(reason === 'interrupt' ? 143 : 124);
      expect(devboxes.getRunLogs).toHaveBeenCalledTimes(1);
      expect(devboxes.stopRun).toHaveBeenCalledOnce();
    }
  );
  it('cancels a stalled log page immediately on interruption', async () => {
    const { client, devboxes } = fixture();
    devboxes.getRunLogs.mockImplementation(() => {
      interrupt('SIGINT');
      return new Promise(() => {});
    });
    await expect(box.runBoxOffload({ client, ...options })).resolves.toBe(130);
    expect(devboxes.getRunLogs).toHaveBeenCalledTimes(1);
    expect(devboxes.stopRun).toHaveBeenCalledOnce();
  });
  it('bounds creation and preserves a consumed interruption when creation stalls', async () => {
    vi.useFakeTimers();
    const { client, devboxes } = fixture();
    devboxes.createRun.mockImplementation(() => {
      interrupt('SIGTERM');
      return new Promise(() => {});
    });
    const result = box.runBoxOffload({ client, ...options });
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await result).toBe(143);
    expect(devboxes.stopRun).not.toHaveBeenCalled();
  });
  it('bounds a stalled stop independently of the interrupted follow signal', async () => {
    vi.useFakeTimers();
    const { client, devboxes } = fixture();
    devboxes.createRun.mockImplementation(async () => {
      interrupt('SIGINT');
      return { run: { id: 'run-1', status: 'queued' } };
    });
    devboxes.stopRun.mockImplementation(() => new Promise(() => {}));
    let settled = false;
    const result = box.runBoxOffload({ client, ...options }).then((code) => {
      settled = true;
      return code;
    });
    await vi.advanceTimersByTimeAsync(15_001);
    expect(settled).toBe(true);
    expect(await result).toBe(130);
    expect(devboxes.stopRun).toHaveBeenCalledOnce();
  });
  it('bounds a stalled creation without treating a timeout as a rejection', async () => {
    vi.useFakeTimers();
    const { devboxes, run } = fixture();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    devboxes.createRun.mockImplementation(() => new Promise(() => {}));
    let settled = false;
    const result = run().then((code) => {
      settled = true;
      return code;
    });
    await vi.advanceTimersByTimeAsync(15_001);
    expect(settled).toBe(true);
    expect(await result).toBe(1);
  });
  it('treats a server request timeout as an uncertain creation', async () => {
    const { devboxes, run } = fixture();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    devboxes.createRun.mockRejectedValue(
      Object.assign(new Error('timeout'), { status: 408 })
    );
    await expect(run()).resolves.toBe(1);
  });
  it('passes abort signals through the real SDK transport for every offload request', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            run: { id: 'run-1', status: 'queued' },
            logs: [],
            next: 0,
          })
        )
    );
    const client = new DevboxesClient({
      baseUrl: 'https://example.invalid',
      fetch,
    });
    const signal = new AbortController().signal;
    await client.createRun(
      { command: ['true'], leaseMode: 'auto' },
      { signal }
    );
    await client.getRun('run-1', { signal });
    await client.getRunLogs('run-1', { offset: 1000, signal });
    await client.stopRun('run-1', { signal });
    await client.fleet.snapshot({ signal });
    expect(fetch).toHaveBeenCalledTimes(5);
    for (const call of fetch.mock.calls)
      expect((call as unknown as [unknown, RequestInit])[1].signal).toBe(
        signal
      );
  });
});
