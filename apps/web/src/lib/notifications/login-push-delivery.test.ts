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

describe('login approval notification delivery', () => {
  it('routes iOS review actions using identifiers without approval secrets', async () => {
    const data = {
      openTarget: 'mfa_approval',
      entityId: 'challenge',
      userId: 'user',
      expiresAt: '2099-01-01T00:00:00Z',
    };
    await sendCustomPushMessageBatch({
      devices: [{ token: 'device' }],
      message: {
        title: 'Sign-in request',
        body: 'Review',
        data,
        category: 'tuturuuu_login_approval',
        expiresAt: data.expiresAt,
      },
    });
    const payload = mocks.send.mock.calls[0]![0];
    expect(payload.apns.payload.aps.category).toBe('tuturuuu_login_approval');
    expect(JSON.parse(payload.apns.payload.payload)).toEqual(data);
    expect(payload.data).toEqual(data);
    expect(payload.apns.headers['apns-expiration']).toBe(
      String(Date.parse(data.expiresAt) / 1000)
    );
    expect(payload.android.ttl).toBeGreaterThan(0);
  });
  it('does not add login actions to ordinary notifications', async () => {
    await sendCustomPushMessageBatch({
      devices: [{ token: 'device' }],
      message: {
        title: 'Task update',
        body: 'Changed',
        data: { openTarget: 'task' },
      },
    });
    const payload = mocks.send.mock.calls[0]![0];
    expect(payload.apns.payload.payload).toBeUndefined();
    expect(payload.apns.payload.aps.category).toBeUndefined();
  });
  it('reports invalid registrations without treating transient errors as revoked', async () => {
    mocks.send.mockResolvedValueOnce({
      successCount: 0,
      responses: [
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        { success: false, error: { code: 'messaging/server-unavailable' } },
      ],
    });
    const result = await sendCustomPushMessageBatch({
      devices: [{ token: 'revoked' }, { token: 'retry' }],
      message: { title: 'Sign-in request', body: 'Review' },
    });
    expect(result.invalidTokens).toEqual(['revoked']);
  });
});
