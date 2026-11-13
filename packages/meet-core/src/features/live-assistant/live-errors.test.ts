import { afterEach, expect, it, vi } from 'vitest';
import {
  LiveStartError,
  liveErrorMessageKey,
  liveStartErrorCode,
  microphoneErrorCode,
  withDeadline,
} from './live-errors';

afterEach(() => {
  vi.useRealTimers();
});

it('names the microphone problem a person can fix', () => {
  const named = (name: string) => Object.assign(new Error(name), { name });
  expect(microphoneErrorCode(named('NotAllowedError'))).toBe(
    'microphone_blocked'
  );
  expect(microphoneErrorCode(named('NotFoundError'))).toBe(
    'microphone_missing'
  );
  expect(microphoneErrorCode(named('NotReadableError'))).toBe(
    'microphone_busy'
  );
  expect(microphoneErrorCode(named('OverconstrainedError'))).toBe(
    'input_unavailable'
  );
});

it('renders specific device messages and never a raw server detail', () => {
  expect(liveErrorMessageKey('microphone_blocked')).toBe(
    'error_microphone_blocked'
  );
  expect(liveErrorMessageKey('output_unavailable')).toBe(
    'error_output_unavailable'
  );
  expect(liveErrorMessageKey('Provider said <secret>')).toBe('session_error');
  expect(liveErrorMessageKey('hasOwnProperty')).toBe('session_error');
  expect(liveErrorMessageKey(undefined)).toBe('session_error');
  expect(liveStartErrorCode(new LiveStartError('microphone_missing'))).toBe(
    'microphone_missing'
  );
  expect(liveStartErrorCode(new Error('socket closed'))).toBe('start_failed');
});

it('fails a stalled audio device instead of waiting forever', async () => {
  vi.useFakeTimers();
  const stalled = withDeadline(
    new Promise<void>(() => undefined),
    8000,
    () => new LiveStartError('output_unavailable')
  );
  const result = stalled.catch((error: unknown) => liveStartErrorCode(error));
  await vi.advanceTimersByTimeAsync(8000);
  await expect(result).resolves.toBe('output_unavailable');
  await expect(withDeadline(Promise.resolve(1), 10, Error)).resolves.toBe(1);
});
