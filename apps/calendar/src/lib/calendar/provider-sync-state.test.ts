import { expect, it, vi } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: create,
}));

import {
  clearSyncToken,
  getSyncToken,
  storeSyncToken,
} from '@tuturuuu/trigger/google-calendar-sync';

it('keeps sync-state reads and writes on the injected cancellable database client', async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ success: true, sync_token: 'test-sync-token' }],
    error: null,
  });
  const client = { rpc } as never;
  expect(await getSyncToken('workspace', 'calendar', client)).toBe(
    'test-sync-token'
  );
  await storeSyncToken(
    'workspace',
    'next-token',
    new Date(),
    'calendar',
    client
  );
  await clearSyncToken('workspace', 'calendar', client);
  expect(create).not.toHaveBeenCalled();
  expect(rpc.mock.calls.map((call) => call[1].p_operation)).toEqual([
    'get',
    'update',
    'clear',
  ]);
});
