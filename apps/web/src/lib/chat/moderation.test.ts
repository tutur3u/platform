import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ rpc: mocks.rpc }),
}));

const { canModerateChat } = await import('./moderation');

describe('canModerateChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('asks for the permission chat_delete_message enforces', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(
      canModerateChat({ actorUserId: 'user-1', wsId: 'ws-1' })
    ).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_permission: 'moderate_chat',
      p_user_id: 'user-1',
      p_ws_id: 'ws-1',
    });
  });

  it('reports false without the permission or when the check fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(
      canModerateChat({ actorUserId: 'user-1', wsId: 'ws-1' })
    ).resolves.toBe(false);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(
      canModerateChat({ actorUserId: 'user-1', wsId: 'ws-1' })
    ).resolves.toBe(false);

    mocks.rpc.mockRejectedValueOnce(new Error('offline'));
    await expect(
      canModerateChat({ actorUserId: 'user-1', wsId: 'ws-1' })
    ).resolves.toBe(false);
  });
});
