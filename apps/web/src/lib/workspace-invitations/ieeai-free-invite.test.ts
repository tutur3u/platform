import { describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { acceptIeeaiFreeInvite, IEEAI_WORKSPACE_ID } from './ieeai-free-invite';

describe('IEEAI free invitation boundary', () => {
  function fixture() {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const schema = vi.fn().mockReturnValue({ rpc });
    return {
      rpc,
      schema,
      args: {
        admin: { schema } as unknown as TypedSupabaseClient,
        appId: 'ieeai-stats',
        allowedWorkspaceIds: [IEEAI_WORKSPACE_ID],
        authEmail: 'synthetic@example.test',
        userId: '00000000-0000-4000-8000-000000000001',
        workspaceId: IEEAI_WORKSPACE_ID,
      },
    };
  }

  it('sends only verified ids to the atomic private RPC', async () => {
    const { args, rpc, schema } = fixture();
    expect(await acceptIeeaiFreeInvite(args)).toBe(true);
    expect(schema).toHaveBeenCalledWith('private');
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'accept_ieeai_free_workspace_invite',
      {
        p_actor_id: args.userId,
        p_allowed_workspace_ids: [IEEAI_WORKSPACE_ID],
        p_app_id: 'ieeai-stats',
        p_workspace_id: IEEAI_WORKSPACE_ID,
      }
    );
  });

  it.each([
    { appId: 'other-app' },
    { workspaceId: '00000000-0000-4000-8000-000000000099' },
    { allowedWorkspaceIds: [] },
    { authEmail: null },
  ])(
    'does not call the database outside the verified boundary: %j',
    async (change) => {
      const { args, rpc } = fixture();
      expect(await acceptIeeaiFreeInvite({ ...args, ...change })).toBe(false);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it.each([
    { data: false, error: null },
    { data: null, error: null },
    { data: true, error: { message: 'synthetic private diagnostic' } },
  ])('fails closed without exposing RPC diagnostics: %j', async (result) => {
    const { args, rpc } = fixture();
    rpc.mockResolvedValue(result);
    expect(await acceptIeeaiFreeInvite(args)).toBe(false);
  });

  it('fails closed on transport failure', async () => {
    const { args, rpc } = fixture();
    rpc.mockRejectedValue(new Error('synthetic transport diagnostic'));
    expect(await acceptIeeaiFreeInvite(args)).toBe(false);
  });
});
