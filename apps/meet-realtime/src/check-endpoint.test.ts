import { expect, test } from 'bun:test';
import { validateMeetCheckEndpoint } from './check-endpoint';

test('accepts encrypted remote checks and loopback development', () => {
  for (const url of [
    'wss://meet-realtime.tuturuuu.com/realtime',
    'ws://127.0.0.1:7899/realtime',
    'ws://localhost:7899/realtime',
    'ws://[::1]:7899/realtime',
  ])
    expect(validateMeetCheckEndpoint(url)).toBe(url);
});

test('rejects cleartext remote endpoints and non-WebSocket schemes', () => {
  for (const url of [
    'ws://meet-realtime.tuturuuu.com/realtime',
    'ws://localhost.example.com/realtime',
    'ws://127.0.0.1.example.com/realtime',
    'https://meet-realtime.tuturuuu.com/realtime',
    'http://127.0.0.1:7899/realtime',
  ])
    expect(() => validateMeetCheckEndpoint(url)).toThrow();
});
