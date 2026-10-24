import { afterEach, describe, expect, it, vi } from 'vitest';
import * as box from './resources-box-offload';

// Server fixture that dedupes creates on the idempotency key, as the web
// handler does, and can cancel a run by that key.
function server() {
  const runs = new Map<string, { id: string; status: string }>();
  const lines: string[] = [];
  const devboxes = {
    createRun: vi.fn(
      async (payload: { idempotencyKey?: string }): Promise<unknown> => {
        const key = payload.idempotencyKey ?? 'missing';
        const run = runs.get(key) ?? {
          id: `run-${runs.size + 1}`,
          status: 'queued',
        };
        runs.set(key, run);
        return { run: { ...run } };
      }
    ),
    getRun: vi.fn(async () => ({
      run: { id: 'run-1', status: 'succeeded', exitCode: 0 },
    })),
    getRunLogs: vi.fn(async () => ({ logs: [] as string[], next: 0 })),
    stopRun: vi.fn(async () => ({ message: 'stopped' })),
    stopRunByKey: vi.fn(async (key: string) => {
      const run = runs.get(key);
      if (!run)
        throw Object.assign(new Error('No devbox run exists for that key.'), {
          status: 404,
        });
      run.status = 'cancelled';
      return { message: 'cancelled', runId: run.id, status: 'cancelled' };
    }),
  };
  const options = {
    client: { devboxes } as never,
    runnerId: 'trusted-1',
    sha: 'a'.repeat(40),
    prefix: '',
    argv: ['true'],
    timeoutSeconds: 60,
    pollMs: 1,
    stopRetryMs: 1,
    write: () => {},
    log: (text: string) => lines.push(text),
  };
  return { devboxes, lines, options, runs };
}
function interrupt(signal: 'SIGINT' | 'SIGTERM') {
  // Invoke only the operation's handler, never signal the test runner itself.
  const handler = process.listeners(signal).at(-1);
  if (!handler) throw new Error('missing offload signal handler');
  handler(signal);
}
afterEach(() => vi.restoreAllMocks());

describe('lost creation acknowledgements are cancelled by operation key', () => {
  it('sends a fresh operation key with every create', async () => {
    const { devboxes, options } = server();
    await box.runBoxOffload(options);
    await box.runBoxOffload(options);
    const [first, second] = devboxes.createRun.mock.calls.map(
      ([payload]) => payload.idempotencyKey
    );
    expect(first).toMatch(/^[0-9a-f-]{36}$/u);
    expect(second).toMatch(/^[0-9a-f-]{36}$/u);
    expect(first).not.toBe(second);
  });

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)(
    '%s: an accepted create whose ack is lost is stopped by its key',
    async (signal, code) => {
      const { devboxes, lines, options, runs } = server();
      const accept = devboxes.createRun.getMockImplementation()!;
      devboxes.createRun.mockImplementation(async (payload) => {
        await accept(payload); // the server committed the run...
        interrupt(signal);
        throw new Error('socket hang up'); // ...but the ack never arrived
      });
      await expect(box.runBoxOffload(options)).resolves.toBe(code);
      const key = devboxes.createRun.mock.calls[0]![0].idempotencyKey;
      expect(devboxes.stopRunByKey).toHaveBeenCalledOnce();
      expect(devboxes.stopRunByKey).toHaveBeenCalledWith(key, {
        signal: expect.any(AbortSignal),
      });
      expect([...runs.values()]).toEqual([
        { id: 'run-1', status: 'cancelled' },
      ]);
      expect(lines.join('\n')).toContain(
        `stop requested for run run-1 (operation ${key})`
      );
    }
  );

  it('retries while the create may still be in flight, then reports an unconfirmed key', async () => {
    const { devboxes, lines, options } = server();
    devboxes.createRun.mockImplementation(async () => {
      interrupt('SIGINT');
      throw new Error('offload request timed out');
    });
    await expect(box.runBoxOffload(options)).resolves.toBe(130);
    const key = devboxes.createRun.mock.calls[0]![0].idempotencyKey;
    // Bounded: a fixed number of attempts, then a notice naming the key.
    expect(devboxes.stopRunByKey).toHaveBeenCalledTimes(3);
    expect(lines.at(-1)).toContain('cancellation was not confirmed');
    expect(lines.at(-1)).toContain(`Operation key ${key}`);
  });

  it('stops an ambiguous create without falling back to a local run', async () => {
    const { devboxes, options, runs } = server();
    const accept = devboxes.createRun.getMockImplementation()!;
    devboxes.createRun.mockImplementation(async (payload) => {
      await accept(payload);
      throw Object.assign(new Error('bad gateway'), { status: 502 });
    });
    await expect(box.runBoxOffload(options)).rejects.toMatchObject({
      name: 'OffloadNotCreatedError',
      rejected: false,
    });
    expect([...runs.values()][0]?.status).toBe('cancelled');
  });

  it('treats the coded idempotency 503 as a definite rejection', async () => {
    const { devboxes, options } = server();
    devboxes.createRun.mockRejectedValue(
      Object.assign(new Error('keys unavailable'), {
        status: 503,
        code: 'DEVBOX_IDEMPOTENCY_UNAVAILABLE',
      })
    );
    await expect(box.runBoxOffload(options)).rejects.toMatchObject({
      rejected: true,
    });
    expect(devboxes.stopRunByKey).not.toHaveBeenCalled();
  });

  it('keeps an uncoded 503 ambiguous', async () => {
    const { devboxes, options } = server();
    devboxes.createRun.mockRejectedValue(
      Object.assign(new Error('gateway'), { status: 503 })
    );
    await expect(box.runBoxOffload(options)).rejects.toMatchObject({
      rejected: false,
    });
    expect(devboxes.stopRunByKey).toHaveBeenCalled();
  });

  it('does not cancel anything after a definite rejection', async () => {
    const { devboxes, options } = server();
    devboxes.createRun.mockRejectedValue(
      Object.assign(new Error('forbidden'), { status: 403 })
    );
    await expect(box.runBoxOffload(options)).rejects.toMatchObject({
      rejected: true,
    });
    expect(devboxes.stopRunByKey).not.toHaveBeenCalled();
  });
});
