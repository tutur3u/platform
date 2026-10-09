// Fits 100 IDs of 255 UTF-16 units even when every unit is JSON-escaped.
export const MAX_IMMEDIATE_REQUEST_BYTES = 256 * 1024;
export const MAX_IMMEDIATE_REQUEST_CHUNKS = 4096;
export const MAX_IMMEDIATE_REQUEST_DURATION_MS = 10_000;

export class ImmediateRequestTooLargeError extends Error {
  constructor() {
    super('Immediate notification request body exceeds its byte limit');
    this.name = 'ImmediateRequestTooLargeError';
  }
}

export class ImmediateRequestTimeoutError extends Error {
  constructor() {
    super('Immediate notification request body deadline exceeded');
    this.name = 'ImmediateRequestTimeoutError';
  }
}

/** Read bounded bytes before parsing JSON, independent of framework adapters. */
export async function readImmediateRequestBody(
  request: Request
): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ImmediateRequestTimeoutError()),
      MAX_IMMEDIATE_REQUEST_DURATION_MS
    );
  });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (chunks.length >= MAX_IMMEDIATE_REQUEST_CHUNKS) {
        throw new ImmediateRequestTooLargeError();
      }
      size += value.byteLength;
      if (size > MAX_IMMEDIATE_REQUEST_BYTES) {
        throw new ImmediateRequestTooLargeError();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } finally {
    clearTimeout(timer);
    // An uncooperative source may never finish cancellation. Do not extend
    // the read deadline or replace its result with a cancellation failure.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
