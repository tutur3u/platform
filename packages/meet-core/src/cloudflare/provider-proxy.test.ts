import { expect, it, vi } from 'vitest';
import { proxyMeetingProvider } from './provider-proxy';

const endpoint =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent';
it('rejects unapproved destinations and methods before any provider request', async () => {
  const send = vi.fn();
  for (const url of [
    'https://example.com/secret',
    endpoint.replace('/models/', '/files/'),
    endpoint.replace('https:', 'http:'),
  ]) {
    expect(
      (
        await proxyMeetingProvider(
          new Request(url, { method: 'POST', body: '{}' }),
          'test-key',
          send
        )
      ).status
    ).toBe(403);
  }
  expect(
    (await proxyMeetingProvider(new Request(endpoint), 'test-key', send)).status
  ).toBe(403);
  expect(send).not.toHaveBeenCalled();
});
it('uses only the server credential and does not forward caller credentials or redirect', async () => {
  const send = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  const response = await proxyMeetingProvider(
    new Request(`${endpoint}?key=caller`, {
      method: 'POST',
      headers: { Cookie: 'private-cookie', Authorization: 'Bearer caller' },
      body: '{}',
    }),
    'test-key',
    send
  );
  expect(response.status).toBe(200);
  const [target, options] = send.mock.calls[0]!;
  expect(String(target)).not.toContain('caller');
  expect(options.headers).toEqual({
    'Content-Type': 'application/json',
    'x-goog-api-key': 'test-key',
  });
  expect(options.redirect).toBe('manual');
});
it('never returns provider error bodies that could contain request material', async () => {
  const send = vi
    .fn()
    .mockResolvedValue(
      new Response('private provider diagnostic', { status: 400 })
    );
  const response = await proxyMeetingProvider(
    new Request(endpoint, { method: 'POST', body: '{}' }),
    'test-key',
    send
  );
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain('private provider diagnostic');
});
it('bounds the request body before invoking the provider', async () => {
  const send = vi.fn();
  const response = await proxyMeetingProvider(
    new Request(endpoint, { method: 'POST', body: new Uint8Array(12_000_001) }),
    'test-key',
    send
  );
  expect(response.status).toBe(413);
  expect(send).not.toHaveBeenCalled();
});
