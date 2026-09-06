import { describe, expect, it } from 'vitest';
import { MEET_REALTIME_URL, resolveMeetRealtimeUrl } from './endpoint';

describe('Meet realtime endpoint', () => {
  it('uses the Cloudflare hostname in production and workerd locally', () => {
    expect(resolveMeetRealtimeUrl()).toBe(MEET_REALTIME_URL);
    expect(resolveMeetRealtimeUrl(undefined, true)).toBe(
      'ws://127.0.0.1:8786/realtime'
    );
  });
  it('migrates old internal-host defaults even when explicitly configured', () => {
    expect(resolveMeetRealtimeUrl('wss://meet.tuturuuu.com/realtime')).toBe(
      MEET_REALTIME_URL
    );
    expect(resolveMeetRealtimeUrl(' wss://meet.tuturuuu.com/realtime/ ')).toBe(
      MEET_REALTIME_URL
    );
  });
  it('preserves an explicitly configured Worker or local check endpoint', () => {
    expect(resolveMeetRealtimeUrl('wss://test.workers.dev/realtime')).toBe(
      'wss://test.workers.dev/realtime'
    );
    expect(resolveMeetRealtimeUrl('ws://localhost:8786/realtime')).toBe(
      'ws://localhost:8786/realtime'
    );
  });
});
