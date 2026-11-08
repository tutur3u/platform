import { describe, expect, it, vi } from 'vitest';
import { isMeetingNotesAdmin } from './notes-admin';

const input = { wsId: 'workspace-a', userId: 'user-1' };

describe('meeting notes admin check', () => {
  it('asks for the admin permission in the meeting workspace only', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(
      isMeetingNotesAdmin({ ...input, supabase: { rpc } as never })
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_ws_id: 'workspace-a',
      p_user_id: 'user-1',
      p_permission: 'admin',
    });
  });

  it.each([false, null, 'true', 1])(
    'denies a non-true answer (%s)',
    async (data) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      await expect(
        isMeetingNotesAdmin({ ...input, supabase: { rpc } as never })
      ).resolves.toBe(false);
    }
  );

  it('throws on a lookup failure so callers fail closed', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(
      isMeetingNotesAdmin({ ...input, supabase: { rpc } as never })
    ).rejects.toThrow('meet_notes_admin_lookup_failed');
  });
});
