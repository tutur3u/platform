import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { capabilities, executeJob } = vi.hoisted(() => ({
  capabilities: vi.fn(),
  executeJob: vi.fn(),
}));
vi.mock('./devbox-agent-capabilities', () => ({
  createDevboxAgentCapabilities: capabilities,
}));
vi.mock('./devbox-runner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./devbox-runner')>()),
  executeDevboxAgentJob: executeJob,
}));

import { pollDevboxAgentJobs } from '../platform-devbox';
import { runDevboxAgentLoop } from './devbox-agent';
import {
  agentRequest,
  backoffDelay,
  DevboxAgentTransientError,
  DevboxAgentWatchdogError,
  withAgentRetries,
} from './devbox-agent-network';

type Handler = (request: IncomingMessage) => 'hang' | [number, unknown];
let server: Server | undefined;
async function fakeControlPlane(handler: Handler) {
  server = createServer((request, response) => {
    request.resume();
    const result = handler(request);
    // A hung socket: accept the request and never answer it.
    if (result === 'hang') return;
    response.writeHead(result[0], { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result[1]));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const fast = {
  httpTimeoutMs: 100,
  heartbeatIntervalMs: 100,
  watchdogIntervals: 4,
  backoffBaseMs: 10,
  backoffMaxMs: 40,
};
const restartJob = {
  jobs: [{ command: ['__ttr_restart_agent_v1__'], runId: 'run-restart' }],
};

beforeEach(() => {
  capabilities.mockReset().mockResolvedValue({ cli: { version: 'fixture' } });
  executeJob.mockReset().mockResolvedValue({ status: 'succeeded' });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('TUTURUUU_DEVBOX_CONTROL_URL', '');
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
  server = undefined;
});

describe('agent request classification', () => {
  it('treats thrown fetches and retryable statuses as transient', async () => {
    await expect(
      agentRequest('fixture', () => Promise.reject(new TypeError('reset')))
    ).rejects.toBeInstanceOf(DevboxAgentTransientError);
    for (const status of [408, 429, 500, 503])
      await expect(
        agentRequest('fixture', async () => new Response('', { status }))
      ).rejects.toBeInstanceOf(DevboxAgentTransientError);
    for (const status of [200, 401, 403, 404])
      expect(
        (
          await agentRequest(
            'fixture',
            async () => new Response('', { status })
          )
        ).status
      ).toBe(status);
  });

  it('bounds jittered backoff and retries only transient failures', async () => {
    const timing = { backoffBaseMs: 100, backoffMaxMs: 1000 };
    expect(backoffDelay(1, timing, () => 0)).toBe(50);
    expect(backoffDelay(3, timing, () => 1)).toBe(400);
    expect(backoffDelay(20, timing, () => 1)).toBe(1000);
    const sleep = vi.fn(async () => {});
    let calls = 0;
    expect(
      await withAgentRetries(
        async () => {
          calls += 1;
          if (calls < 3) throw new DevboxAgentTransientError('flaky');
          return 'ok';
        },
        3,
        timing,
        sleep
      )
    ).toBe('ok');
    expect(sleep).toHaveBeenCalledTimes(2);
    await expect(
      withAgentRetries(
        async () => {
          throw new Error('fatal');
        },
        3,
        timing,
        sleep
      )
    ).rejects.toThrow('fatal');
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe('hanging control plane', { timeout: 15_000 }, () => {
  it('times out a claim against a socket that never answers', async () => {
    const baseUrl = await fakeControlPlane(() => 'hang');
    const started = Date.now();
    await expect(
      pollDevboxAgentJobs({ baseUrl, timeoutMs: 100, token: 'fixture' })
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('exits non-zero through the watchdog instead of hanging forever', async () => {
    const baseUrl = await fakeControlPlane(() => 'hang');
    const started = Date.now();
    await expect(
      runDevboxAgentLoop({ baseUrl, token: 'fixture', timing: fast })
    ).rejects.toBeInstanceOf(DevboxAgentWatchdogError);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('recovers after hung heartbeats and keeps claiming', async () => {
    let heartbeats = 0;
    const baseUrl = await fakeControlPlane((request) => {
      if (request.url?.endsWith('/heartbeat'))
        return ++heartbeats <= 2 ? 'hang' : [200, { message: 'ok' }];
      return [200, heartbeats > 2 ? restartJob : { jobs: [] }];
    });
    await runDevboxAgentLoop({ baseUrl, token: 'fixture', timing: fast });
    expect(heartbeats).toBeGreaterThanOrEqual(3);
    expect(executeJob).toHaveBeenCalledTimes(1);
  });

  it('backs off hung claims while heartbeats continue', async () => {
    let polls = 0;
    let heartbeats = 0;
    const baseUrl = await fakeControlPlane((request) => {
      if (request.url?.endsWith('/heartbeat')) {
        heartbeats += 1;
        return [200, { message: 'ok' }];
      }
      return ++polls <= 3 ? 'hang' : [200, restartJob];
    });
    await runDevboxAgentLoop({ baseUrl, token: 'fixture', timing: fast });
    expect(polls).toBe(4);
    expect(heartbeats).toBeGreaterThanOrEqual(1);
    expect(executeJob).toHaveBeenCalledTimes(1);
  });

  it('still fails fast on a rejected runner token', async () => {
    const baseUrl = await fakeControlPlane(() => [401, { message: 'no' }]);
    await expect(
      runDevboxAgentLoop({ baseUrl, token: 'fixture', timing: fast })
    ).rejects.toThrow('Devbox agent heartbeat failed: 401');
  });

  it('hard watchdog exits when an await stays wedged', async () => {
    const baseUrl = await fakeControlPlane(() => [200, { jobs: [] }]);
    let release: (error: Error) => void = () => {};
    capabilities
      .mockResolvedValueOnce({ cli: { version: 'fixture' } })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            release = reject;
          })
      );
    const exited = new Promise<number>((resolve) => {
      const loop = runDevboxAgentLoop({
        baseUrl,
        token: 'fixture',
        timing: { ...fast, watchdogIntervals: 2 },
        exit: (code) => {
          resolve(code);
          release(new Error('released after exit'));
        },
      });
      void loop.catch(() => {});
    });
    expect(await exited).toBe(75);
  });
});
