import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./firebase-admin', () => ({
  getFirebaseMessagingClient: () => ({ sendEachForMulticast: mocks.send }),
}));

import {
  buildPushData,
  sendCustomPushMessageBatch,
  sendPushNotificationBatch,
} from './push-delivery';

const actor = '00000000-0000-4000-8000-000000000001';
const ws = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const other = '00000000-0000-4000-8000-000000000004';
const notification = {
  id,
  user_id: actor,
  ws_id: ws,
  type: 'task_assigned',
  title: 'Synthetic task',
  description: 'Synthetic update',
  created_at: '2026-10-07T00:00:00Z',
  data: {},
};
const prefix = 'tuturuuu:inbox:v1:';
function tuple(data: Record<string, string>) {
  expect(data.inboxIdentity).toMatch(/^tuturuuu:inbox:v1:[A-Za-z0-9_-]+$/);
  return JSON.parse(
    Buffer.from(data.inboxIdentity!.slice(prefix.length), 'base64url').toString(
      'utf8'
    )
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({
    successCount: 1,
    responses: [{ success: true }],
  });
});
describe('trusted persisted inbox identity producer', () => {
  it('binds recipient and workspace to columns, never navigation metadata', () => {
    const data = buildPushData({
      ...notification,
      data: { userId: other, workspace_id: other },
    });
    expect(data.userId).toBe(actor);
    expect(tuple(data)).toEqual([actor, ws, id]);
  });
  it('keeps personal inbox ownership separate from target workspace navigation', () => {
    const data = buildPushData({
      ...notification,
      ws_id: null,
      data: { workspace_id: ws },
    });
    expect(data.wsId).toBe(ws);
    expect(tuple(data)).toEqual([actor, null, id]);
  });
  it('is stable across title/body changes and collision-free across full scoped identity', () => {
    const base = buildPushData(notification).inboxIdentity;
    expect(base).toBeDefined();
    expect(
      buildPushData({
        ...notification,
        title: 'Different synthetic label',
        description: 'Different copy',
      }).inboxIdentity
    ).toBe(base);
    const values = [
      base,
      buildPushData({ ...notification, user_id: other }).inboxIdentity,
      buildPushData({ ...notification, ws_id: other }).inboxIdentity,
      buildPushData({ ...notification, ws_id: null }).inboxIdentity,
      buildPushData({ ...notification, id: other }).inboxIdentity,
    ];
    expect(new Set(values).size).toBe(5);
  });
  it.each([
    { ...notification, user_id: undefined },
    { ...notification, user_id: '' },
    { ...notification, user_id: 'not-account-uuid' },
    { ...notification, id: 'not-notification-uuid' },
    { ...notification, ws_id: undefined },
    { ...notification, ws_id: 'not-workspace-uuid' },
  ])('leaves unverifiable legacy identity unowned %#', (value) => {
    expect(buildPushData(value).inboxIdentity).toBeUndefined();
  });
  it('preserves legacy Mail navigation without upgrading metadata to trusted inbox ownership', () => {
    const data = buildPushData({
      ...notification,
      user_id: undefined,
      ws_id: null,
      type: 'mail_received',
      data: {
        userId: actor,
        mailboxId: 'synthetic-mailbox',
        threadId: 'synthetic-thread',
        messageId: 'synthetic-message',
      },
    });
    expect(data.userId).toBe(actor);
    expect(data.openTarget).toBe('mail');
    expect(data.inboxIdentity).toBeUndefined();
  });
  it('actual transport carries identical full identity in FCM data and Android tag', async () => {
    await sendPushNotificationBatch({
      notification,
      devices: [{ token: 'synthetic-device' }],
    });
    expect(mocks.send).toHaveBeenCalledOnce();
    const payload = mocks.send.mock.calls[0]![0];
    expect(tuple(payload.data)).toEqual([actor, ws, id]);
    expect(payload.android.notification.tag).toBe(payload.data.inboxIdentity);
    expect(payload.android.priority).toBe('high');
    expect(payload.apns.payload.aps.sound).toBe('default');
  });
  it('does not infer an owned OS tag from arbitrary custom push data', async () => {
    const data = {
      customMarker: 'preserved',
      inboxIdentity:
        prefix +
        Buffer.from(JSON.stringify([actor, ws, id])).toString('base64url'),
    };
    await sendCustomPushMessageBatch({
      devices: [{ token: 'synthetic-device' }],
      message: { title: 'Synthetic custom', body: 'Update', data },
    });
    expect(
      mocks.send.mock.calls[0]![0].android.notification.tag
    ).toBeUndefined();
    expect(mocks.send.mock.calls[0]![0].data.inboxIdentity).toBeUndefined();
    expect(mocks.send.mock.calls[0]![0].data.customMarker).toBe('preserved');
    expect(data.inboxIdentity).toBeDefined();
  });
  it('missing trusted recipient still sends legacy push without an owned tag', async () => {
    await sendPushNotificationBatch({
      notification: { ...notification, user_id: undefined },
      devices: [{ token: 'synthetic-device' }],
    });
    const payload = mocks.send.mock.calls[0]![0];
    expect(payload.data.inboxIdentity).toBeUndefined();
    expect(payload.android.notification.tag).toBeUndefined();
  });
  it('no devices never invokes provider transport', async () => {
    await sendPushNotificationBatch({ notification, devices: [] });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
