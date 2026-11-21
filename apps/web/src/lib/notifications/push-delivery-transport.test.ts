import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const sendEachForMulticast = vi.fn();
vi.mock('./firebase-admin', () => ({
  getFirebaseMessagingClient: () => ({ sendEachForMulticast }),
}));

import {
  buildMulticastMessage,
  buildPushCollapseKey,
  sendCustomPushMessageBatch,
  sendPushNotificationBatch,
} from './push-delivery';

const TASK_ID = '6f1c1b8e-0d2a-4d2e-9a77-0a3c5f0e8b11';

function response(codes: Array<string | null>) {
  return {
    successCount: codes.filter((code) => code === null).length,
    responses: codes.map((code) =>
      code === null ? { success: true } : { success: false, error: { code } }
    ),
  };
}

const devices = [{ token: 'a' }, { token: 'b' }];
const message = { title: 'Title', body: 'Body' };

beforeEach(() => {
  sendEachForMulticast.mockReset();
});

describe('push provider flags', () => {
  it('sends user-visible alerts at APNs priority 10 and FCM high priority', () => {
    const payload = buildMulticastMessage(['a'], message);
    expect(payload.apns?.headers).toMatchObject({
      'apns-push-type': 'alert',
      'apns-priority': '10',
    });
    expect(payload.android).toMatchObject({
      priority: 'high',
      notification: { channelId: 'tuturuuu_notifications' },
    });
    expect(payload.notification).toEqual({ title: 'Title', body: 'Body' });
  });

  it('sends data-only pushes as APNs background at priority 5', () => {
    const payload = buildMulticastMessage(['a'], {
      ...message,
      dataOnly: true,
    });
    expect(payload.apns?.headers).toMatchObject({
      'apns-push-type': 'background',
      'apns-priority': '5',
    });
    expect(payload.apns?.payload?.aps).toEqual({ contentAvailable: true });
    expect(payload.notification).toBeUndefined();
  });

  it('collapses only task field-change pushes per task', () => {
    expect(
      buildPushCollapseKey({
        type: 'task_title_changed',
        entity_type: 'task',
        entity_id: TASK_ID,
      })
    ).toBe(`task:${TASK_ID}`);
    expect(
      buildPushCollapseKey({
        type: 'task_due_date_changed',
        entity_type: 'task',
        entity_id: TASK_ID,
      })
    ).toBe(`task:${TASK_ID}`);
    for (const type of ['task_mention', 'task_assigned', 'deadline_reminder'])
      expect(
        buildPushCollapseKey({ type, entity_type: 'task', entity_id: TASK_ID })
      ).toBeNull();
    expect(
      buildPushCollapseKey({
        type: 'chat_message',
        entity_type: 'chat_conversation',
        entity_id: TASK_ID,
      })
    ).toBeNull();
  });

  it('sets the collapse id on both providers for a task update', async () => {
    sendEachForMulticast.mockResolvedValue(response([null]));
    await sendPushNotificationBatch({
      devices: [{ token: 'a' }],
      notification: {
        id: 'n',
        type: 'task_moved',
        title: 'Moved',
        description: null,
        data: {},
        created_at: '2026-11-21T00:00:00.000Z',
        entity_type: 'task',
        entity_id: TASK_ID,
      },
    });
    const payload = sendEachForMulticast.mock.calls[0]![0];
    expect(payload.android.collapseKey).toBe(`task:${TASK_ID}`);
    expect(payload.apns.headers['apns-collapse-id']).toBe(`task:${TASK_ID}`);
  });
});

const notification = {
  id: 'n',
  type: 'task_assigned',
  title: 'Assigned',
  description: null,
  data: {},
  created_at: '2026-11-21T00:00:00.000Z',
};

describe('push sends and token pruning', () => {
  it('makes one provider call per send, without replaying failures', async () => {
    sendEachForMulticast.mockResolvedValue(
      response([
        null,
        'messaging/internal-error',
        'messaging/unknown-error',
        'messaging/server-unavailable',
      ])
    );
    expect(
      await sendPushNotificationBatch({
        devices: [...devices, { token: 'c' }, { token: 'd' }],
        notification,
      })
    ).toEqual({ deliveredCount: 1, invalidTokens: [] });
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
  });

  it('propagates a rejected provider call', async () => {
    sendEachForMulticast.mockRejectedValue(new Error('network'));
    await expect(
      sendCustomPushMessageBatch({ devices, message })
    ).rejects.toThrow('network');
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
  });

  it('prunes unregistered tokens but never on invalid-argument', async () => {
    sendEachForMulticast.mockResolvedValue(
      response([
        'messaging/registration-token-not-registered',
        'messaging/invalid-argument',
      ])
    );
    expect(await sendPushNotificationBatch({ devices, notification })).toEqual({
      deliveredCount: 0,
      invalidTokens: ['a'],
    });
  });
});
