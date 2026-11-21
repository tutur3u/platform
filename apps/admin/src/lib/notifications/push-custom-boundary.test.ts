import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./firebase-admin', () => ({
  getFirebaseMessagingClient: () => ({ sendEachForMulticast: mocks.send }),
}));

import { sendCustomPushMessageBatch } from './push-delivery';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({
    successCount: 1,
    responses: [{ success: true }],
  });
});

describe('Infrastructure custom push inbox identity boundary', () => {
  it.each([false, true])(
    'removes reserved identity without altering custom metadata (dataOnly=%s)',
    async (dataOnly) => {
      const data = Object.freeze({
        inboxIdentity: 'tuturuuu:inbox:v1:synthetic-reserved-value',
        userId: 'synthetic-navigation-account',
        customMarker: 'preserved',
      });
      await sendCustomPushMessageBatch({
        devices: [{ token: 'synthetic-token' }],
        message: { title: 'Synthetic', body: 'Update', data, dataOnly },
      });
      expect(mocks.send).toHaveBeenCalledOnce();
      const payload = mocks.send.mock.calls[0]![0];
      expect(payload.data.inboxIdentity).toBeUndefined();
      expect(payload.data).toEqual({
        userId: data.userId,
        customMarker: data.customMarker,
      });
      expect(payload.android.notification?.tag).toBeUndefined();
      expect(payload.notification === undefined).toBe(dataOnly);
      expect(payload.apns.payload.aps.sound).toBe('default');
      expect(data.inboxIdentity).toBeDefined();
    }
  );

  it('preserves absent data', async () => {
    await sendCustomPushMessageBatch({
      devices: [{ token: 'synthetic-token' }],
      message: { title: 'Synthetic', body: 'Update' },
    });
    expect(mocks.send.mock.calls[0]![0].data).toBeUndefined();
  });

  it('does not dispatch when no devices exist', async () => {
    await sendCustomPushMessageBatch({
      devices: [],
      message: { title: 'Synthetic', body: 'Update' },
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
