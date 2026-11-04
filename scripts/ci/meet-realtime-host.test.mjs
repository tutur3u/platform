import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isKnownMeetRealtimeHost } from '../../apps/meet-realtime/src/host-policy.ts';

test('admits canonical ingress and local HTTP fixtures', () => {
  for (const origin of [
    'https://meet-realtime.tuturuuu.com',
    'http://localhost:8876',
    'http://127.0.0.1:8876',
    'http://[::1]:8876',
  ])
    assert.equal(
      isKnownMeetRealtimeHost(new Request(`${origin}/health`)),
      true
    );
});
test('rejects alternate ingress before health, channel and room routing', () => {
  for (const origin of [
    'https://foreign.workers.dev',
    'https://preview.invalid',
    'https://meet-realtime.tuturuuu.com.evil.invalid',
    'http://meet-realtime.tuturuuu.com',
    'https://meet-realtime.tuturuuu.com:444',
  ])
    for (const path of ['/health', '/channels', '/collaboration', '/realtime'])
      assert.equal(
        isKnownMeetRealtimeHost(new Request(`${origin}${path}`)),
        false
      );
});
