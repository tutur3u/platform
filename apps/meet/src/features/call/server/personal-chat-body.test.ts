import { expect, it, vi } from 'vitest';

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

import { readPersonalChatBody } from './personal-chat-body';

it('rejects and cancels a chunked oversized body before reading its remainder', async () => {
  const cancel = vi.fn();
  let reads = 0;
  const request = new Request('https://meet.test', {
    method: 'POST',
    body: new ReadableStream(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(40001));
        },
        cancel,
      },
      { highWaterMark: 0 }
    ),
    duplex: 'half',
  } as RequestInit);
  await expect(readPersonalChatBody(request)).rejects.toMatchObject({
    status: 413,
  });
  expect(reads).toBe(1);
  expect(cancel).toHaveBeenCalledOnce();
});
it('rejects advertised oversized bodies without reading bytes', async () => {
  const pull = vi.fn(),
    cancel = vi.fn();
  const request = new Request('https://meet.test', {
    method: 'POST',
    headers: { 'content-length': '40001' },
    body: new ReadableStream({ pull, cancel }, { highWaterMark: 0 }),
    duplex: 'half',
  } as RequestInit);
  await expect(readPersonalChatBody(request)).rejects.toMatchObject({
    status: 413,
  });
  expect(pull).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
});
it('parses a small UTF-8 message', async () => {
  const body = { question: 'Xin chào' };
  expect(
    await readPersonalChatBody(
      new Request('https://meet.test', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    )
  ).toEqual(body);
});
