import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import {
  assertDevboxRunnerAcceptsRun,
  DEVBOX_RUNNER_DRAINING_MESSAGE,
} from './runner-drain-guard';
import type { DevboxPrivateSchemaClient } from './store-utils';

type Row = Record<string, string | null>;

function fakeClient(
  tables: Record<string, Record<string, Row>>,
  error: { message: string } | null = null
) {
  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: (_column: string, id: string) => ({
        limit: async () => ({
          data: error ? null : [tables[table]?.[id]].filter(Boolean),
          error,
        }),
      }),
    }),
  }));
  return { client: { from, rpc: vi.fn() } as DevboxPrivateSchemaClient, from };
}

const draining = { 'runner-a': { drain_requested_at: '2026-10-23T00:00:00Z' } };

describe('assertDevboxRunnerAcceptsRun', () => {
  it('rejects a run pinned to a draining runner with 409', async () => {
    const { client } = fakeClient({ devbox_runners: draining });
    await expect(
      assertDevboxRunnerAcceptsRun(client, { runnerId: 'runner-a' })
    ).rejects.toMatchObject({
      message: DEVBOX_RUNNER_DRAINING_MESSAGE,
      status: 409,
    });
  });

  it('rejects a run on an existing lease held by a draining runner', async () => {
    const { client } = fakeClient({
      devbox_leases: { 'lease-1': { runner_id: 'runner-a' } },
      devbox_runners: draining,
    });
    await expect(
      assertDevboxRunnerAcceptsRun(client, {
        leaseId: 'lease-1',
        workload: 'build',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows maintenance on a draining runner without querying', async () => {
    const { client, from } = fakeClient({ devbox_runners: draining });
    await expect(
      assertDevboxRunnerAcceptsRun(client, {
        runnerId: 'runner-a',
        workload: 'maintenance',
      })
    ).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it('allows unpinned runs and runners that are not draining', async () => {
    const { client, from } = fakeClient({
      devbox_runners: { 'runner-b': { drain_requested_at: null } },
    });
    await expect(assertDevboxRunnerAcceptsRun(client, {})).resolves.toBe(
      undefined
    );
    expect(from).not.toHaveBeenCalled();
    await expect(
      assertDevboxRunnerAcceptsRun(client, { runnerId: 'runner-b' })
    ).resolves.toBeUndefined();
  });

  it('skips the check before the drain column exists', async () => {
    const { client } = fakeClient(
      {},
      { message: 'column devbox_runners.drain_requested_at does not exist' }
    );
    await expect(
      assertDevboxRunnerAcceptsRun(client, { runnerId: 'runner-a' })
    ).resolves.toBeUndefined();
  });
});
