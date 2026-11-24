import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/realtime/meet', () => ({
  meetClassAttendanceEnabled: () => false,
}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: () => ({ url: 'http://localhost', key: 'key' }),
  getSupabaseCookieOptions: () => ({}),
}));
vi.mock('./store', () => ({ createQaStore: () => ({}) }));

import { deleteQaUser, deleteQaUsers } from './deletion';
import { createQaDeletionDeps } from './runtime';

const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const rpc = vi.fn();
const admin = { schema: () => ({ rpc }) } as never;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 'deleted', error: null });
});

it('deletes a QA workspace through the erase-and-delete function and never a Personal one', async () => {
  await createQaDeletionDeps(admin).deleteWorkspace(WS);
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith('delete_workspace_erasing_mira', {
    p_ws_id: WS,
    p_only_non_personal: true,
  });
});

it('fails the cleanup when the delete fails, so the run is retried', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: '23503' } });
  await expect(createQaDeletionDeps(admin).deleteWorkspace(WS)).rejects.toEqual(
    { code: '23503' }
  );
});

// The QA teardown, the account-management path and the expiry sweeper all
// delete through createQaDeletionDeps, so one wiring covers every path.
const USER = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
function deps() {
  const store = {
    beginDelete: vi.fn(async () => ({
      state: 'deleting' as const,
      authPresent: true,
      runId: 'run-1',
      runWorkspaceId: WS,
    })),
    finishWorkspaceDelete: vi.fn(async () => true),
    finishDelete: vi.fn(async () => ({ state: 'deleted' as const })),
  };
  return {
    store,
    deps: {
      ...createQaDeletionDeps(admin),
      store: store as never,
      deleteAuthUser: vi.fn(async () => 'deleted' as const),
    },
  };
}

it('a QA workspace blocked by Mira evidence stays pending, then deletes cleanly on the next pass', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { store, deps: qa } = deps();
  // Before the fix: the delete is refused and the account stays 'deleting'.
  rpc.mockResolvedValueOnce({ data: null, error: { code: '23503' } });
  expect(await deleteQaUser(qa, USER, 'cron', null)).toBe('pending');
  expect(store.finishWorkspaceDelete).not.toHaveBeenCalled();
  expect(store.finishDelete).not.toHaveBeenCalled();
  expect(qa.deleteAuthUser).not.toHaveBeenCalled();
  // The next pass re-runs the same teardown and settles it.
  expect(await deleteQaUser(qa, USER, 'cron', null)).toBe('deleted');
  expect(store.finishWorkspaceDelete).toHaveBeenCalledOnce();
  expect(store.finishDelete).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledTimes(2);
  for (const call of rpc.mock.calls)
    expect(call).toEqual([
      'delete_workspace_erasing_mira',
      { p_ws_id: WS, p_only_non_personal: true },
    ]);
});

it('the expiry sweeper deletes a due account through the same wrapper', async () => {
  const { deps: qa } = deps();
  const result = await deleteQaUsers(qa, [USER], 'cron', null, {
    deadline: Date.now() + 60_000,
  });
  expect(result.deleted).toEqual([USER]);
  expect(rpc).toHaveBeenCalledWith('delete_workspace_erasing_mira', {
    p_ws_id: WS,
    p_only_non_personal: true,
  });
});
