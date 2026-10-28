import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  access: vi.fn(),
  message: vi.fn(),
  upsert: vi.fn(),
  thread: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: m.access }));
vi.mock('./messages', () => ({ getMailMessage: m.message }));
vi.mock('./shared', () => ({ privateTable: () => ({ upsert: m.upsert }) }));
vi.mock('./thread-preferences', () => ({
  isThreadPreferenceAction: (action: string) => action === 'mute_thread',
  updateThreadPreferences: m.thread,
}));

import { updateMailMessageState } from './state';

describe('mail message state mailbox boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.access.mockResolvedValue({ admin: {} });
    m.upsert.mockResolvedValue({ error: null });
  });
  const run = (action: 'star' | 'mark_read' | 'archive' | 'trash') =>
    updateMailMessageState({
      ctx: {
        normalizedWsId: 'ws',
        supabase: {} as never,
        user: { id: 'actor' },
      },
      mailboxId: 'mailbox-a',
      messageId: 'message-b',
      payload: { action },
    });
  it.each(['star', 'mark_read', 'archive', 'trash'] as const)(
    'rejects a missing or foreign message before %s writes',
    async (action) => {
      m.message.mockResolvedValue(null);
      expect(await run(action)).toBeNull();
      expect(m.upsert).not.toHaveBeenCalled();
      expect(m.message).toHaveBeenCalledWith(
        expect.objectContaining({
          mailboxId: 'mailbox-a',
          messageId: 'message-b',
        })
      );
    }
  );
  it('preserves updates for a message in the authorized mailbox', async () => {
    m.message.mockResolvedValue({ id: 'message-b', threadId: 'thread' });
    expect(await run('star')).toMatchObject({ id: 'message-b' });
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        mailbox_id: 'mailbox-a',
        message_id: 'message-b',
        user_id: 'actor',
        starred_at: expect.any(String),
      }),
      { onConflict: 'message_id,user_id' }
    );
    expect(m.message.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      m.upsert.mock.invocationCallOrder[0] ?? -Infinity
    );
  });
});
