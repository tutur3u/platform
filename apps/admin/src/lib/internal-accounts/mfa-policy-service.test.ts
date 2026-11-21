import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRequiredMfaPolicyAvailable,
  setInternalAccountMfaPolicy,
} from './mfa-policy-service';

const mocks = vi.hoisted(() => ({ coordinate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/coordination', () => ({
  coordinate: mocks.coordinate,
  coordinationKey: (value: string) => value,
}));
function fixture() {
  const user = { id: 'target', email: 'target@tuturuuu.com', app_metadata: {} };
  const getUserById = vi
    .fn()
    .mockResolvedValue({ data: { user }, error: null });
  const updateUserById = vi
    .fn()
    .mockResolvedValue({ data: { user }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
  const input = {
    actorUserId: 'actor',
    targetUserId: 'target',
    confirmationEmail: user.email,
    required: true,
    sbAdmin: {
      rpc,
      auth: { admin: { getUserById, updateUserById } },
    } as unknown as TypedSupabaseClient,
  };
  return { input, rpc, getUserById, updateUserById };
}
beforeEach(() => {
  vi.stubEnv('REQUIRED_MFA_POLICY_ENABLED', 'true');
  vi.clearAllMocks();
  mocks.coordinate.mockImplementation(
    async ({ action }: { action: string }) => ({
      outcome:
        action === 'acquire'
          ? 'acquired'
          : action === 'check'
            ? 'owned'
            : 'released',
    })
  );
});
describe('required MFA administrative rollout and mutation', () => {
  it('does not enable controls from schema readiness alone', async () => {
    vi.stubEnv('REQUIRED_MFA_POLICY_ENABLED', 'false');
    const f = fixture();
    expect(await isRequiredMfaPolicyAvailable(f.input.sbAdmin)).toBe(false);
    await expect(setInternalAccountMfaPolicy(f.input)).rejects.toMatchObject({
      status: 503,
    });
    expect(f.updateUserById).not.toHaveBeenCalled();
  });
  it('requires the applied enforcement migration', async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({ data: null, error: { message: 'missing' } });
    await expect(setInternalAccountMfaPolicy(f.input)).rejects.toMatchObject({
      status: 503,
    });
    expect(f.updateUserById).not.toHaveBeenCalled();
  });
  it('refuses self-policy changes', async () => {
    const f = fixture();
    await expect(
      setInternalAccountMfaPolicy({ ...f.input, actorUserId: 'target' })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.coordinate).not.toHaveBeenCalled();
  });
  it('binds confirmation to the freshly fetched internal target', async () => {
    const f = fixture();
    await expect(
      setInternalAccountMfaPolicy({
        ...f.input,
        confirmationEmail: 'another@tuturuuu.com',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(mocks.coordinate).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'release' })
    );
  });
  it('uses a new recovery boundary for required policy', async () => {
    const f = fixture();
    await setInternalAccountMfaPolicy(f.input);
    expect(f.rpc).toHaveBeenCalledWith('transition_account_mfa_policy', {
      p_user_id: 'target',
      p_expected: null,
      p_next: { required: true },
      p_clear_devices: false,
    });
    expect(f.updateUserById).not.toHaveBeenCalled();
  });
});
