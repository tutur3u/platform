import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMeetCheckEndpoint } from './check-endpoint.ts';

test('accepts encrypted remote checks and loopback development', () => {
  for (const url of [
    'wss://meet-realtime.tuturuuu.com/realtime',
    'ws://127.0.0.1:7899/realtime',
    'ws://localhost:7899/realtime',
    'ws://[::1]:7899/realtime',
  ])
    assert.equal(validateMeetCheckEndpoint(url), url);
});

test('rejects cleartext remote endpoints and non-WebSocket schemes', () => {
  for (const url of [
    'wss://meet-realtime.tuturuuu.com/realtime?existing=value',
    'wss://meet-realtime.tuturuuu.com/realtime#fragment',
    'wss://meet-realtime.tuturuuu.com/realtime?',
    'wss://name:password@meet-realtime.tuturuuu.com/realtime',
    'ws://meet-realtime.tuturuuu.com/realtime',
    'ws://localhost.example.com/realtime',
    'ws://127.0.0.1.example.com/realtime',
    'https://meet-realtime.tuturuuu.com/realtime',
    'http://127.0.0.1:7899/realtime',
  ])
    assert.throws(() => validateMeetCheckEndpoint(url));
});
