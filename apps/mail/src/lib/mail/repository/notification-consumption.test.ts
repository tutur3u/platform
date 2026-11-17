import { describe, expect, it, vi } from 'vitest';
import { moveBlockedMailAndConsumeNotifications } from './notification-consumption';

function setup(data: unknown = 2, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const schema = vi.fn(() => ({ rpc }));
  return { admin: { schema }, schema, rpc };
}
const input = {
  mailboxId: 'mailbox',
  userId: 'actor',
  labelId: 'blocked-label',
  messageIds: ['b', 'a', 'a'],
};

describe('blocked Mail notification consumption', () => {
  it('moves exact deduplicated messages atomically for the actor and mailbox', async () => {
    const { admin, schema, rpc } = setup();
    await expect(
      moveBlockedMailAndConsumeNotifications({ admin, ...input })
    ).resolves.toBe(2);
    expect(schema).toHaveBeenCalledWith('private');
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'move_mail_to_blocked_and_consume_notifications',
      {
        p_mailbox_id: 'mailbox',
        p_user_id: 'actor',
        p_label_id: 'blocked-label',
        p_message_ids: ['a', 'b'],
      }
    );
  });
  it('does no write when no messages moved', async () => {
    const { admin, rpc } = setup(0);
    await expect(
      moveBlockedMailAndConsumeNotifications({
        admin,
        ...input,
        messageIds: [],
      })
    ).resolves.toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects more than one bounded movement chunk', async () => {
    const { admin, rpc } = setup();
    await expect(
      moveBlockedMailAndConsumeNotifications({
        admin,
        ...input,
        messageIds: Array.from({ length: 501 }, (_, i) => String(i)),
      })
    ).rejects.toThrow('limit exceeded');
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    [null, { code: '42501' }],
    [1, null],
    [null, null],
  ])(
    'surfaces refusal or an incomplete atomic result (%s)',
    async (data, error) => {
      const { admin } = setup(data, error);
      await expect(
        moveBlockedMailAndConsumeNotifications({ admin, ...input })
      ).rejects.toThrow('Failed to move');
    }
  );
});
