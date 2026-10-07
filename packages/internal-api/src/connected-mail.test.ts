import { expect, it, vi } from 'vitest';
import { connectedMailPath, connectedMailRequest } from './connected-mail';

it('encodes provider message ids and account boundaries', () => {
  expect(connectedMailPath('personal', ['account', 'messages', 'a/b+='])).toBe(
    '/api/v1/workspaces/personal/mail/connected/account/messages/a%2Fb%2B%3D'
  );
});
it('sends mutation bodies through the authenticated Mail client', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    );
  await connectedMailRequest(
    'personal',
    ['connect'],
    { method: 'POST', body: { provider: 'google' } },
    { fetch }
  );
  const init = fetch.mock.calls[0]?.[1];
  expect(init).toMatchObject({
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    body: '{"provider":"google"}',
  });
});
