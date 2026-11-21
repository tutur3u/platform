import type { Dispatcher } from 'undici';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedCronFetch } from './network';

const mocks = vi.hoisted(() => ({
  callManagedCronRpc: vi.fn(),
  listEnabledManagedCronDomains: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('./domain-repository', () => ({
  listEnabledManagedCronDomains: (
    ...args: Parameters<typeof mocks.listEnabledManagedCronDomains>
  ) => mocks.listEnabledManagedCronDomains(...args),
}));

vi.mock('./rpc', () => ({
  callManagedCronRpc: (...args: Parameters<typeof mocks.callManagedCronRpc>) =>
    mocks.callManagedCronRpc(...args),
  ensureRpcArray: <T>(value: unknown): T[] =>
    Array.isArray(value) ? (value as T[]) : [],
}));

import { processDueManagedCronJobs } from './service';

function dispatcherForAddress(address: string) {
  return {
    address,
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Dispatcher & { address: string };
}

function dueJob() {
  return {
    active: true,
    endpoint_url: 'https://hooks.example.com/run',
    headers_config: [],
    http_method: 'GET',
    id: 'job-1',
    name: 'Daily sync',
    retry_count: 0,
    schedule: '*/5 * * * *',
    schedule_timezone: 'UTC',
    timeout_ms: 1000,
    ws_id: 'ws-1',
  };
}

describe('managed cron service network safety', () => {
  beforeEach(() => {
    mocks.callManagedCronRpc.mockReset();
    mocks.listEnabledManagedCronDomains.mockReset();
    mocks.listEnabledManagedCronDomains.mockResolvedValue(['example.com']);
  });

  it('does not follow redirects returned by whitelisted endpoints', async () => {
    const dispatcher = dispatcherForAddress('93.184.216.34');
    const createDispatcher = vi.fn(() => dispatcher);
    const resolveHost = vi.fn(async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    const fetchImpl: ManagedCronFetch = vi.fn(async (url, init) => {
      expect(url.toString()).toBe('https://hooks.example.com/run');
      expect(init.dispatcher).toBe(dispatcher);
      expect(init.redirect).toBe('manual');

      return new Response('redirect body', {
        headers: { location: 'https://169.254.169.254/latest/meta-data/' },
        status: 302,
      });
    });
    const recordedExecutions: Array<Record<string, unknown>> = [];

    mocks.callManagedCronRpc.mockImplementation(
      async (fn: string, args?: Record<string, unknown>) => {
        if (fn === 'managed_cron_claim_due_jobs') return [dueJob()];
        if (fn === 'managed_cron_load_secret_values') return [];
        if (fn === 'managed_cron_record_execution') {
          recordedExecutions.push(args ?? {});
          return null;
        }
        throw new Error(`Unexpected RPC ${fn}`);
      }
    );

    const summary = await processDueManagedCronJobs({
      network: { createDispatcher, fetchImpl, resolveHost },
      runnerId: 'test-runner',
    });

    expect(summary).toMatchObject({
      claimed: 1,
      failed: 1,
      succeeded: 0,
    });
    expect(resolveHost).toHaveBeenCalledWith('hooks.example.com');
    expect(createDispatcher).toHaveBeenCalledWith({
      address: '93.184.216.34',
      family: 4,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(dispatcher.close).toHaveBeenCalledTimes(1);
    expect(recordedExecutions[0]).toMatchObject({
      p_endpoint_url: 'https://hooks.example.com/run',
      p_http_status: 302,
      p_response: 'redirect body',
      p_status: 'failed',
    });
  });

  it('blocks private DNS answers before dispatching the request', async () => {
    const fetchImpl: ManagedCronFetch = vi.fn();
    const recordedExecutions: Array<Record<string, unknown>> = [];

    mocks.callManagedCronRpc.mockImplementation(
      async (fn: string, args?: Record<string, unknown>) => {
        if (fn === 'managed_cron_claim_due_jobs') return [dueJob()];
        if (fn === 'managed_cron_load_secret_values') return [];
        if (fn === 'managed_cron_record_execution') {
          recordedExecutions.push(args ?? {});
          return null;
        }
        throw new Error(`Unexpected RPC ${fn}`);
      }
    );

    const summary = await processDueManagedCronJobs({
      network: {
        fetchImpl,
        resolveHost: vi.fn(async () => [
          { address: '169.254.169.254', family: 4 },
        ]),
      },
      runnerId: 'test-runner',
    });

    expect(summary).toMatchObject({
      claimed: 1,
      failed: 1,
      succeeded: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(recordedExecutions[0]).toMatchObject({
      p_endpoint_url: 'https://hooks.example.com/run',
      p_http_status: null,
      p_response: null,
      p_status: 'failed',
    });
    expect(recordedExecutions[0]?.p_error).toContain('private network');
  });
});
