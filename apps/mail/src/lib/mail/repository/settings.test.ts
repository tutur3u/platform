import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireMailboxAccess } from './bootstrap';
import { updateMailboxSettings } from './settings';

vi.mock('./bootstrap', () => ({
  requireMailboxAccess: vi.fn(),
}));

const requireMailboxAccessMock = vi.mocked(requireMailboxAccess);

describe('updateMailboxSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps personal sender identity managed by the Tuturuuu user profile', async () => {
    const update = vi.fn();
    const builder = {
      eq: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: {
          ai_instructions: '',
          auto_draft_enabled: false,
          sender_name: 'Stored legacy name',
        },
        error: null,
      }),
    };
    update.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.select.mockReturnValue(builder);
    requireMailboxAccessMock.mockResolvedValue({
      admin: {
        schema: () => ({ from: () => ({ update }) }),
      },
      mailbox: {
        senderName: 'Võ Hoàng Phúc',
        type: 'personal',
      },
      role: 'owner',
    } as never);

    const result = await updateMailboxSettings({
      ctx: {} as never,
      mailboxId: 'mailbox-id',
      payload: { senderName: 'Spoofed sender' },
    });

    expect(update).not.toHaveBeenCalled();
    expect(result?.senderName).toBe('Võ Hoàng Phúc');
  });
});
