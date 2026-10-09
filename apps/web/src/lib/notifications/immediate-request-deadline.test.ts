import { afterEach, expect, it, vi } from 'vitest';
import {
  ImmediateRequestTimeoutError,
  ImmediateRequestTooLargeError,
  MAX_IMMEDIATE_REQUEST_BYTES,
  MAX_IMMEDIATE_REQUEST_DURATION_MS,
  readImmediateRequestBody,
} from './immediate-request-body';

afterEach(() => vi.useRealTimers());
function stalled(cancel = vi.fn()) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const pull = vi.fn(() => new Promise<void>(() => {}));
  const body = new ReadableStream<Uint8Array>(
    {
      start(c) {
        controller = c;
      },
      pull,
      cancel,
    },
    { highWaterMark: 0 }
  );
  const req = new Request('http://localhost', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
  return { req, controller, pull, cancel };
}

it('stops a stalled read at the total deadline and releases its lock', async () => {
  vi.useFakeTimers();
  const f = stalled();
  const pending = readImmediateRequestBody(f.req);
  const rejected = expect(pending).rejects.toBeInstanceOf(
    ImmediateRequestTimeoutError
  );
  await vi.advanceTimersByTimeAsync(MAX_IMMEDIATE_REQUEST_DURATION_MS - 1);
  expect(f.cancel).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(f.pull).toHaveBeenCalledTimes(1);
  expect(f.cancel).toHaveBeenCalledTimes(1);
  expect(f.req.body?.locked).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not renew the total deadline when a partial chunk arrives', async () => {
  vi.useFakeTimers();
  const f = stalled();
  const pending = readImmediateRequestBody(f.req);
  const rejected = expect(pending).rejects.toBeInstanceOf(
    ImmediateRequestTimeoutError
  );
  await vi.advanceTimersByTimeAsync(9000);
  f.controller.enqueue(new TextEncoder().encode('{'));
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
  expect(f.cancel).toHaveBeenCalledTimes(1);
});

it('does not wait for cancellation that never settles after a timeout', async () => {
  vi.useFakeTimers();
  const f = stalled(vi.fn(() => new Promise<void>(() => {})));
  const rejected = expect(
    readImmediateRequestBody(f.req)
  ).rejects.toBeInstanceOf(ImmediateRequestTimeoutError);
  await vi.advanceTimersByTimeAsync(MAX_IMMEDIATE_REQUEST_DURATION_MS);
  await rejected;
  expect(f.req.body?.locked).toBe(false);
  expect(f.cancel).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves overflow despite cancellation that never settles', async () => {
  vi.useFakeTimers();
  const f = stalled(vi.fn(() => new Promise<void>(() => {})));
  f.controller.enqueue(new Uint8Array(MAX_IMMEDIATE_REQUEST_BYTES + 1));
  await expect(readImmediateRequestBody(f.req)).rejects.toBeInstanceOf(
    ImmediateRequestTooLargeError
  );
  expect(vi.getTimerCount()).toBe(0);
  expect(f.req.body?.locked).toBe(false);
});

it('clears the deadline on success so later time cannot reject it', async () => {
  vi.useFakeTimers();
  const f = stalled();
  f.controller.enqueue(new TextEncoder().encode('{}'));
  f.controller.close();
  expect(await readImmediateRequestBody(f.req)).toBe('{}');
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(MAX_IMMEDIATE_REQUEST_DURATION_MS);
});

it('clears the timer and preserves transport failure before the deadline', async () => {
  vi.useFakeTimers();
  const f = stalled();
  const failure = new Error('synthetic transport failure');
  const rejected = expect(readImmediateRequestBody(f.req)).rejects.toBe(
    failure
  );
  f.controller.error(failure);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
  expect(f.req.body?.locked).toBe(false);
});

it('absorbs a late read rejection and cancellation error after timeout', async () => {
  vi.useFakeTimers();
  let failRead!: (error: Error) => void;
  const body = new ReadableStream<Uint8Array>(
    {
      pull: () =>
        new Promise<void>((_, reject) => {
          failRead = reject;
        }),
      cancel: () => Promise.reject(new Error('synthetic cancellation failure')),
    },
    { highWaterMark: 0 }
  );
  const request = new Request('http://localhost', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
  const rejected = expect(
    readImmediateRequestBody(request)
  ).rejects.toBeInstanceOf(ImmediateRequestTimeoutError);
  await vi.advanceTimersByTimeAsync(MAX_IMMEDIATE_REQUEST_DURATION_MS);
  await rejected;
  failRead(new Error('synthetic late read failure'));
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(body.locked).toBe(false);
});
