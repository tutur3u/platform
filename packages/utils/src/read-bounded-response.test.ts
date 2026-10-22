// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readBoundedResponseBytes } from './read-bounded-response';

function source(chunks: Uint8Array[], contentLength?: string) {
  let index = 0;
  const cancel = vi.fn();
  const pull = vi.fn(
    (controller: ReadableStreamDefaultController<Uint8Array>) => {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    }
  );
  const body = new ReadableStream<Uint8Array>(
    { pull, cancel },
    { highWaterMark: 0 }
  );
  const headers = new Headers();
  if (contentLength !== undefined) headers.set('content-length', contentLength);
  return { response: { body, headers }, pull, cancel };
}

describe('readBoundedResponseBytes', () => {
  it.each([undefined, '0', '1', 'invalid', '-1'])(
    'returns actual bytes with absent or misleading header %s',
    async (header) => {
      const { response, cancel } = source(
        [new Uint8Array([1, 2]), new Uint8Array(0), new Uint8Array([3, 4])],
        header
      );
      const result = await readBoundedResponseBytes({ response, maxBytes: 4 });
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
      expect(cancel).not.toHaveBeenCalled();
      expect(response.body.locked).toBe(false);
    }
  );

  it('accepts exactly the declared and actual limit', async () => {
    const { response } = source([new Uint8Array([4, 3, 2, 1])], '4');
    await expect(
      readBoundedResponseBytes({ response, maxBytes: 4 })
    ).resolves.toEqual(new Uint8Array([4, 3, 2, 1]));
    expect(response.body.locked).toBe(false);
  });

  it.each([undefined, '1'])(
    'cancels on cumulative one-byte overflow without further reads (%s)',
    async (header) => {
      const { response, pull, cancel } = source(
        [
          new Uint8Array([1, 2]),
          new Uint8Array([3, 4, 5]),
          new Uint8Array([6]),
        ],
        header
      );
      await expect(
        readBoundedResponseBytes({ response, maxBytes: 4 })
      ).rejects.toThrow('response_body_too_large');
      expect(pull).toHaveBeenCalledTimes(2);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(response.body.locked).toBe(false);
    }
  );

  it('rejects an oversized first chunk and never asks for the next chunk', async () => {
    const { response, pull, cancel } = source([
      new Uint8Array(5),
      new Uint8Array(1),
    ]);
    await expect(
      readBoundedResponseBytes({ response, maxBytes: 4 })
    ).rejects.toThrow();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body.locked).toBe(false);
  });

  it('rejects an oversized declaration before reading, using the caller error', async () => {
    const { response, pull, cancel } = source([new Uint8Array(1)], '5');
    await expect(
      readBoundedResponseBytes({
        response,
        maxBytes: 4,
        tooLargeMessage: 'media_limit',
      })
    ).rejects.toThrow('media_limit');
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body.locked).toBe(false);
  });

  it('attempts cancellation and releases the lock on a stream read error', async () => {
    const failure = new Error('read_failed');
    const body = new ReadableStream<Uint8Array>(
      { pull: (controller) => controller.error(failure) },
      { highWaterMark: 0 }
    );
    const reader = body.getReader();
    const cancel = vi.spyOn(reader, 'cancel');
    const getReader = vi.spyOn(body, 'getReader').mockReturnValue(reader);
    try {
      await expect(
        readBoundedResponseBytes({
          response: { body, headers: new Headers() },
          maxBytes: 4,
        })
      ).rejects.toBe(failure);
      expect(cancel).toHaveBeenCalledWith(failure);
      expect(body.locked).toBe(false);
    } finally {
      getReader.mockRestore();
      cancel.mockRestore();
    }
  });

  it('preserves overflow when cancellation fails and still releases the lock', async () => {
    const { response, cancel } = source([new Uint8Array(5)]);
    cancel.mockRejectedValue(new Error('cancel_failed'));
    await expect(
      readBoundedResponseBytes({ response, maxBytes: 4 })
    ).rejects.toThrow('response_body_too_large');
    expect(response.body.locked).toBe(false);
  });

  it('preserves empty-body semantics for null and streamed bodies', async () => {
    for (const response of [
      { body: null, headers: new Headers() },
      source([]).response,
    ]) {
      await expect(
        readBoundedResponseBytes({ response, maxBytes: 0 })
      ).resolves.toEqual(new Uint8Array(0));
    }
  });

  it('rejects a nonempty body at a zero-byte limit', async () => {
    const { response, pull, cancel } = source([new Uint8Array(1)]);
    await expect(
      readBoundedResponseBytes({ response, maxBytes: 0 })
    ).rejects.toThrow();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid public limit %s synchronously before locking',
    (maxBytes) => {
      const { response, pull } = source([]);
      const getReader = vi.spyOn(response.body, 'getReader');
      expect(() => readBoundedResponseBytes({ response, maxBytes })).toThrow(
        RangeError
      );
      expect(getReader).not.toHaveBeenCalled();
      expect(pull).not.toHaveBeenCalled();
      expect(response.body.locked).toBe(false);
    }
  );
});
