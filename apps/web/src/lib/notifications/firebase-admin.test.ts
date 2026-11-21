import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const enableLegacyHttpTransport = vi.fn();
const getMessaging = vi.fn(() => ({ enableLegacyHttpTransport }));

vi.mock('firebase-admin/app', () => ({
  applicationDefault: vi.fn(() => ({})),
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => [{ name: '[DEFAULT]' }]),
  initializeApp: vi.fn(),
}));
vi.mock('firebase-admin/messaging', () => ({ getMessaging }));

describe('getFirebaseMessagingClient', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the HTTP/1.1 transport because Workers lack node:http2', async () => {
    const { getFirebaseMessagingClient } = await import('./firebase-admin');

    const client = getFirebaseMessagingClient();
    expect(enableLegacyHttpTransport).toHaveBeenCalledTimes(1);

    // The configured singleton is reused without reconfiguring.
    expect(getFirebaseMessagingClient()).toBe(client);
    expect(getMessaging).toHaveBeenCalledTimes(1);
    expect(enableLegacyHttpTransport).toHaveBeenCalledTimes(1);
  });
});
