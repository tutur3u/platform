import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, expect, it, vi } from 'vitest';
import { syncWorkspaceUserGuestMembership } from './guest-membership';

function fixture(result: { data: boolean | null; error?: { code: string } }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn().mockReturnValue({ rpc });
  const sbAdmin = { schema } as unknown as TypedSupabaseClient;
  const input = {
    actorId: 'verified-user',
    isGuest: true,
    sbAdmin,
    wsId: 'workspace',
    userId: 'contact',
  };
  return { input, rpc, schema };
}

afterEach(() => vi.restoreAllMocks());

it.each([true, false])(
  'attributes a successful guest update with isGuest=%s',
  async (isGuest) => {
    const { input, rpc, schema } = fixture({ data: true });
    await expect(
      syncWorkspaceUserGuestMembership({ ...input, isGuest })
    ).resolves.toBeUndefined();
    expect(schema).toHaveBeenCalledWith('private');
    expect(rpc).toHaveBeenCalledWith('admin_sync_guest_group_memberships', {
      p_actor_auth_uid: 'verified-user',
      p_ws_id: 'workspace',
      p_user_id: 'contact',
      p_is_guest: isGuest,
    });
  }
);

it('preserves the no-eligible-group warning when marking a contact as a guest', async () => {
  const { input } = fixture({ data: false });
  await expect(
    syncWorkspaceUserGuestMembership({
      ...input,
      warningMessages: { noGuestGroups: 'No matching group' },
    })
  ).resolves.toBe('No matching group');
  await expect(
    syncWorkspaceUserGuestMembership({
      ...input,
      isGuest: false,
    })
  ).resolves.toBeUndefined();
});

it.each([true, false])(
  'avoids a legacy write fallback if guest sync fails with isGuest=%s',
  async (isGuest) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { input, rpc } = fixture({ data: null, error: { code: 'PGRST202' } });
    await expect(
      syncWorkspaceUserGuestMembership({
        ...input,
        isGuest,
        warningMessages: {
          linkFailed: 'Link unavailable',
          unlinkFailed: 'Unlink unavailable',
        },
      })
    ).resolves.toBe(isGuest ? 'Link unavailable' : 'Unlink unavailable');
    expect(rpc).toHaveBeenCalledTimes(1);
  }
);
