import { expect, it } from 'vitest';
import { readLiveRequestBody } from './request-body';

it('enforces byte limits even without a Content-Length header', async () => {
  const response = await readLiveRequestBody(
    new Request('https://meet.test', {
      method: 'POST',
      body: JSON.stringify({ text: 'long body' }),
    }),
    4
  );
  expect(response).toEqual({ ok: false, status: 413 });
});
it('returns a controlled error for invalid JSON', async () => {
  expect(
    await readLiveRequestBody(
      new Request('https://meet.test', { method: 'POST', body: '{' }),
      100
    )
  ).toEqual({ ok: false, status: 400 });
});
