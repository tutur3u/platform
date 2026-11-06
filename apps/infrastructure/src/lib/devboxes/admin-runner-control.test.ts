import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  listDevboxRunnerControl,
  reapStaleDevboxRuns,
  setDevboxRunnerDrain,
} from './admin-runner-control';
import type { DevboxPrivateSchemaClient } from './store-utils';

function fakeClient(
  drain: { data: unknown; error: unknown },
  activity: { data: unknown; error: unknown }
) {
  const rpc = vi.fn().mockResolvedValue(activity);
  return {
    client: {
      from: () => ({
        select: () => ({ neq: vi.fn().mockResolvedValue(drain) }),
      }),
      rpc,
    } as unknown as DevboxPrivateSchemaClient,
    rpc,
  };
}

describe('devbox runner control', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports drained only for a draining runner with no work left', async () => {
    const { client } = fakeClient(
      {
        data: [
          { id: 'a', drain_requested_at: '2026-10-23T00:00:00Z' },
          { id: 'b', drain_requested_at: '2026-10-23T00:00:00Z' },
          { id: 'c', drain_requested_at: null },
        ],
        error: null,
      },
      {
        data: [
          {
            runner_id: 'a',
            queued_runs: 0,
            running_runs: 0,
            active_leases: 0,
            kept_leases: '2',
          },
          {
            runner_id: 'b',
            queued_runs: '0',
            running_runs: '1',
            active_leases: '1',
          },
          { runner_id: 'c', queued_runs: 0, running_runs: 0, active_leases: 0 },
        ],
        error: null,
      }
    );
    const control = await listDevboxRunnerControl(client);
    expect(control.get('a')).toMatchObject({
      drained: true,
      activity: { kept_leases: 2 },
    });
    expect(control.get('b')).toMatchObject({
      drained: false,
      activity: { queued_runs: 0, running_runs: 1, active_leases: 1 },
    });
    expect(control.get('c')).toMatchObject({ drained: false });
  });

  it('degrades to unknown before the migration is applied', async () => {
    const { client } = fakeClient(
      {
        data: null,
        error: { message: 'column drain_requested_at does not exist' },
      },
      { data: null, error: { message: 'Could not find the function' } }
    );
    expect((await listDevboxRunnerControl(client)).size).toBe(0);
  });

  it('calls the guarded drain RPC and surfaces its errors', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: '2026-10-23T00:00:00Z', error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Devbox runner not found or revoked' },
      });
    createAdminClientMock.mockResolvedValue({ schema: () => ({ rpc }) });
    await expect(setDevboxRunnerDrain('runner-1', true)).resolves.toEqual({
      drain_requested_at: '2026-10-23T00:00:00Z',
    });
    expect(rpc).toHaveBeenCalledWith('set_devbox_runner_drain', {
      p_draining: true,
      p_runner_id: 'runner-1',
    });
    await expect(setDevboxRunnerDrain('runner-1', false)).rejects.toThrow(
      'not found or revoked'
    );
  });

  it('runs the global stale-run reap with a bounded limit', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 4, error: null });
    createAdminClientMock.mockResolvedValue({
      schema: () => ({ rpc }),
    });
    await expect(reapStaleDevboxRuns()).resolves.toEqual({
      limit: 200,
      reaped: 4,
    });
    expect(rpc).toHaveBeenCalledWith('reap_stale_devbox_runs', {
      p_limit: 200,
    });
  });
});
