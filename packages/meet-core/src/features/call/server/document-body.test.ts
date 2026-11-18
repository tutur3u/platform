import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { DOCUMENT_BODY_LIMIT, readDocumentBody } from './document-body';

function source(chunks: Uint8Array[]) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[state.pulled++];
      if (next) controller.enqueue(next);
      else controller.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}
function request(stream: ReadableStream<Uint8Array>, length?: number) {
  return {
    body: stream,
    headers: new Headers(
      length === undefined ? {} : { 'content-length': String(length) }
    ),
  } as unknown as Request;
}
async function status(promise: Promise<unknown>) {
  return promise.then(
    () => 200,
    (error: { status?: number }) => error.status
  );
}

describe('bounded document request body', () => {
  it('cancels a declared oversize body before reading any bytes', async () => {
    const { stream, state } = source([new Uint8Array(8)]);
    expect(
      await status(readDocumentBody(request(stream, DOCUMENT_BODY_LIMIT + 1)))
    ).toBe(413);
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThanOrEqual(1);
  });

  it('cancels a streamed body at the limit without buffering the rest', async () => {
    const chunk = new Uint8Array(16 * 1024).fill(32);
    const { stream, state } = source(Array.from({ length: 64 }, () => chunk));
    expect(await status(readDocumentBody(request(stream)))).toBe(413);
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThanOrEqual(6);
  });

  it('parses a body exactly at the limit and refuses invalid UTF-8', async () => {
    const json = `{"action":"create","kind":"notes"}`;
    const padded = new TextEncoder().encode(
      json.padEnd(DOCUMENT_BODY_LIMIT, ' ')
    );
    expect(
      await readDocumentBody(request(source([padded]).stream, padded.length))
    ).toEqual({ action: 'create', kind: 'notes' });
    const invalid = new Uint8Array([0x7b, 0xff, 0x7d]);
    expect(
      await status(readDocumentBody(request(source([invalid]).stream)))
    ).toBe(400);
  });
});
