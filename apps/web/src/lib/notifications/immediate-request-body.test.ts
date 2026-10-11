import { describe, expect, it, vi } from 'vitest';
import {
  ImmediateRequestTooLargeError,
  MAX_IMMEDIATE_REQUEST_BYTES,
  MAX_IMMEDIATE_REQUEST_CHUNKS,
  readImmediateRequestBody,
} from './immediate-request-body';

function request(chunks: Uint8Array[], cancel = vi.fn()) {
  let index = 0;
  const pull = vi.fn(
    (controller: ReadableStreamDefaultController<Uint8Array>) => {
      if (index < chunks.length) controller.enqueue(chunks[index++]!);
      else controller.close();
    }
  );
  return {
    req: new Request('http://localhost/notifications', {
      method: 'POST',
      body: new ReadableStream({ pull, cancel }, { highWaterMark: 0 }),
      duplex: 'half',
    } as RequestInit),
    pull,
    cancel,
  };
}

describe('immediate request byte budget', () => {
  it('accepts an empty body and preserves malformed JSON for the adapter', async () => {
    expect(
      await readImmediateRequestBody(new Request('http://localhost'))
    ).toBe('');
    const f = request([new TextEncoder().encode('{invalid')]);
    expect(await readImmediateRequestBody(f.req)).toBe('{invalid');
  });

  it('accepts exactly the byte ceiling', async () => {
    const f = request([new Uint8Array(MAX_IMMEDIATE_REQUEST_BYTES).fill(65)]);
    expect((await readImmediateRequestBody(f.req)).length).toBe(
      MAX_IMMEDIATE_REQUEST_BYTES
    );
    expect(f.pull).toHaveBeenCalledTimes(2);
  });

  it('cancels before reading further chunks once cumulative bytes exceed the ceiling', async () => {
    const f = request([
      new Uint8Array(MAX_IMMEDIATE_REQUEST_BYTES),
      new Uint8Array(1),
      new Uint8Array(100),
    ]);
    await expect(readImmediateRequestBody(f.req)).rejects.toBeInstanceOf(
      ImmediateRequestTooLargeError
    );
    expect(f.pull).toHaveBeenCalledTimes(2);
    expect(f.cancel).toHaveBeenCalledTimes(1);
    expect(f.req.body?.locked).toBe(false);
  });

  it('does not trust a smaller Content-Length header', async () => {
    const f = request([new Uint8Array(MAX_IMMEDIATE_REQUEST_BYTES + 1)]);
    f.req.headers.set('Content-Length', '1');
    await expect(readImmediateRequestBody(f.req)).rejects.toBeInstanceOf(
      ImmediateRequestTooLargeError
    );
    expect(f.pull).toHaveBeenCalledTimes(1);
    expect(f.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves UTF-8 characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"batch_id":"thử"}');
    const f = request(Array.from(bytes, (byte) => new Uint8Array([byte])));
    expect(await readImmediateRequestBody(f.req)).toBe('{"batch_id":"thử"}');
  });

  it('does not replace a size failure when cancellation also fails', async () => {
    const f = request(
      [new Uint8Array(MAX_IMMEDIATE_REQUEST_BYTES + 1)],
      vi.fn(() => Promise.reject(new Error('cancel failed')))
    );
    await expect(readImmediateRequestBody(f.req)).rejects.toBeInstanceOf(
      ImmediateRequestTooLargeError
    );
  });

  it('propagates transport failure without returning partial JSON', async () => {
    const failure = new Error('connection lost');
    const req = new Request('http://localhost', {
      method: 'POST',
      body: new ReadableStream({
        start(c) {
          c.error(failure);
        },
      }),
      duplex: 'half',
    } as RequestInit);
    await expect(readImmediateRequestBody(req)).rejects.toBe(failure);
    expect(req.body?.locked).toBe(false);
  });

  it('stops repeated empty chunks without unbounded no-progress reads', async () => {
    const f = request(
      Array.from(
        { length: MAX_IMMEDIATE_REQUEST_CHUNKS + 2 },
        () => new Uint8Array(0)
      )
    );
    await expect(readImmediateRequestBody(f.req)).rejects.toBeInstanceOf(
      ImmediateRequestTooLargeError
    );
    expect(f.pull).toHaveBeenCalledTimes(MAX_IMMEDIATE_REQUEST_CHUNKS + 1);
    expect(f.cancel).toHaveBeenCalledTimes(1);
  });

  it('fits 100 maximum-length escaped IDs under the byte budget', async () => {
    const text =
      '{"batch_ids":[' +
      Array(100)
        .fill(`"${'\\u0061'.repeat(255)}"`)
        .join(',') +
      ']}';
    const f = request([new TextEncoder().encode(text)]);
    expect(await readImmediateRequestBody(f.req)).toBe(text);
    expect(JSON.parse(text).batch_ids[0]).toHaveLength(255);
  });
});
