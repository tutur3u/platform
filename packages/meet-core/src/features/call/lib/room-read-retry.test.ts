import { expect, it } from 'vitest';
import { retryRoomRead, roomReadRetryDelay } from './room-read-retry';

const failure = (status: number) => Object.assign(new Error('x'), { status });

it('retries server errors and dropped requests up to three times', () => {
  expect(retryRoomRead(0, failure(500))).toBe(true);
  expect(retryRoomRead(2, failure(503))).toBe(true);
  expect(retryRoomRead(0, new TypeError('Failed to fetch'))).toBe(true);
  expect(retryRoomRead(3, failure(500))).toBe(false);
});

it('treats a refusal as final', () => {
  for (const status of [400, 401, 403, 404, 409])
    expect(retryRoomRead(0, failure(status))).toBe(false);
  expect(retryRoomRead(0, new Error('Recording access is disabled'))).toBe(
    false
  );
});

it('backs off, capped at four seconds', () => {
  expect(roomReadRetryDelay(0)).toBe(1000);
  expect(roomReadRetryDelay(5)).toBe(4000);
});
