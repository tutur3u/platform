import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectHiveRealtime } from './hive-realtime-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function captureSocketUrl(pageUrl: string, realtimeUrl: string) {
  let socketUrl: string | null = null;

  class MockWebSocket {
    static readonly CLOSED = 3;
    static readonly CLOSING = 2;
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;

    readonly readyState = MockWebSocket.CONNECTING;

    constructor(url: string | URL) {
      socketUrl = String(url);
    }

    addEventListener() {}
    close() {}
    send() {}
  }

  vi.stubGlobal('window', {
    location: new URL(pageUrl),
  });
  vi.stubGlobal('WebSocket', MockWebSocket);

  connectHiveRealtime({
    onMessage: vi.fn(),
    token: 'realtime-token',
    url: realtimeUrl,
  });

  return socketUrl;
}

describe('connectHiveRealtime', () => {
  it('upgrades absolute insecure realtime URLs on HTTPS pages', () => {
    expect(
      captureSocketUrl(
        'https://hive.tuturuuu.com/',
        'ws://hive.tuturuuu.com/realtime'
      )
    ).toBe('wss://hive.tuturuuu.com/realtime?token=realtime-token');
  });

  it('uses a secure same-origin realtime URL on HTTPS pages', () => {
    expect(captureSocketUrl('https://hive.tuturuuu.com/', '/realtime')).toBe(
      'wss://hive.tuturuuu.com/realtime?token=realtime-token'
    );
  });
});
