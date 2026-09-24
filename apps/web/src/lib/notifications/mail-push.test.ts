import { describe, expect, it, vi } from 'vitest';
import { getMailPushSkipReason, isPersonalMailPush } from './mail-push';

const notification = {
  id: 'n',
  type: 'mail_received',
  scope: 'user',
  ws_id: null,
  user_id: 'u',
  entity_type: 'mail_message',
  entity_id: 'm',
  data: { userId: 'u', messageId: 'm' },
};
const batch = { channel: 'push', user_id: 'u', ws_id: null };
describe('personal Mail delivery boundary', () => {
  it('permits personal push while rejecting email and other recipients', () => {
    expect(isPersonalMailPush(notification, batch)).toBe(true);
    expect(
      isPersonalMailPush(notification, { ...batch, channel: 'email' })
    ).toBe(false);
    expect(
      isPersonalMailPush(notification, { ...batch, user_id: 'other' })
    ).toBe(false);
  });
  it('rechecks durable provenance, membership and preferences before sending', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const admin = { schema: vi.fn(() => ({ rpc })) };
    expect(await getMailPushSkipReason(admin, notification, batch)).toBe(
      'mail_access_or_preferences_changed'
    );
    expect(rpc).toHaveBeenCalledWith('can_deliver_mail_notification', {
      p_notification_id: 'n',
    });
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await getMailPushSkipReason(admin, notification, batch)).toBeNull();
  });
  it('fails closed on Mail lookup errors and allows other push types', async () => {
    const admin = {
      schema: () => ({ rpc: async () => ({ error: new Error('offline') }) }),
    };
    await expect(
      getMailPushSkipReason(admin, notification, batch)
    ).rejects.toThrow('offline');
    const taskNotification = { ...notification, type: 'task_assigned' };
    expect(
      await getMailPushSkipReason(admin, taskNotification, batch)
    ).toBeNull();
    expect(
      await getMailPushSkipReason(admin, taskNotification, {
        ...batch,
        channel: 'email',
      })
    ).toBe('restricted_workspace');
  });
});
