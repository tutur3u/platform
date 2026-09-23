import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, expect, it, vi } from 'vitest';
import { recoverAccountPassword } from './recovery-service';

const coordinate = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/coordination', () => ({
  coordinate,
  coordinationKey: (v: string) => v,
}));
beforeEach(() => {
  coordinate.mockReset();
  coordinate.mockImplementation(async ({ action }: { action: string }) => ({
    outcome:
      action === 'acquire'
        ? 'acquired'
        : action === 'check'
          ? 'owned'
          : 'released',
  }));
});
function fixture(required = true) {
  const user = {
    id: 'target',
    email: 'target@example.com',
    app_metadata: { tuturuuu_required_mfa: { required, verifiedAfter: 1 } },
  };
  const getUserById = vi.fn(async () => ({ data: { user }, error: null }));
  const updateUserById = vi.fn(
    async (_id: string, attrs: Record<string, unknown>) => {
      if (attrs.app_metadata)
        Object.assign(user.app_metadata, attrs.app_metadata);
      return { data: { user }, error: null };
    }
  );
  const rpc = vi.fn(async (_name: string, args: { p_next: unknown }) => {
    user.app_metadata.tuturuuu_required_mfa =
      args.p_next as typeof user.app_metadata.tuturuuu_required_mfa;
    return { data: args.p_next, error: null };
  });
  return {
    rpc,
    user,
    getUserById,
    updateUserById,
    admin: {
      rpc,
      auth: { admin: { getUserById, updateUserById } },
    } as unknown as TypedSupabaseClient,
  };
}
it('serializes password recovery with policy changes and advances both proofs after completion', async () => {
  const f = fixture();
  await recoverAccountPassword(
    f.admin,
    'target',
    'test-only-password',
    'target@example.com'
  );
  expect(coordinate.mock.invocationCallOrder[0]).toBeLessThan(
    f.getUserById.mock.invocationCallOrder[0]!
  );
  expect(f.updateUserById).toHaveBeenCalledExactlyOnceWith('target', {
    password: 'test-only-password',
  });
  expect(f.rpc).toHaveBeenNthCalledWith(
    1,
    'transition_account_mfa_policy',
    expect.objectContaining({
      p_next: expect.objectContaining({ recoveryInProgress: true }),
    })
  );
  expect(f.rpc).toHaveBeenNthCalledWith(
    2,
    'transition_account_mfa_policy',
    expect.objectContaining({
      p_expected: expect.objectContaining({ recoveryInProgress: true }),
      p_next: expect.objectContaining({ recoveryInProgress: false }),
    })
  );
});
it('reads a newly enabled policy under the acquired lease', async () => {
  const f = fixture(false);
  coordinate.mockImplementation(async ({ action }: { action: string }) => {
    if (action === 'acquire')
      f.user.app_metadata.tuturuuu_required_mfa.required = true;
    return {
      outcome:
        action === 'acquire'
          ? 'acquired'
          : action === 'check'
            ? 'owned'
            : 'released',
    };
  });
  await recoverAccountPassword(
    f.admin,
    'target',
    'test-only-password',
    'target@example.com'
  );
  expect(f.rpc).toHaveBeenCalledTimes(2);
});
it('keeps partial recovery blocked instead of restoring raced proof', async () => {
  const f = fixture();
  f.updateUserById.mockImplementation(async (_id, attrs) => {
    if (attrs.password) throw new Error('provider unavailable');
    Object.assign(f.user.app_metadata, attrs.app_metadata);
    return { data: { user: f.user }, error: null };
  });
  await expect(
    recoverAccountPassword(
      f.admin,
      'target',
      'test-only-password',
      'target@example.com'
    )
  ).rejects.toThrow();
  expect(f.user.app_metadata.tuturuuu_required_mfa).toMatchObject({
    recoveryInProgress: true,
  });
  expect(coordinate).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: 'release' })
  );
});
it('preserves optional-account recovery without enabling MFA', async () => {
  const f = fixture(false);
  await recoverAccountPassword(
    f.admin,
    'target',
    'test-only-password',
    'target@example.com'
  );
  expect(f.updateUserById).toHaveBeenCalledExactlyOnceWith('target', {
    password: 'test-only-password',
  });
});
