import { expect, it, vi } from 'vitest';
import { connectedMailPath, connectedMailRequest } from './connected-mail';

it('encodes provider message ids and account boundaries', () => {
  expect(connectedMailPath('personal', ['account', 'messages', 'a/b+='])).toBe(
    '/api/v1/workspaces/personal/mail/connected/account/messages/a%2Fb%2B%3D'
  );
});
it('lists accounts with authenticated GET queries and no mutation body', async () => {
  const accounts = [
    { id: 'account-1', address: 'user@example.com', provider: 'google' },
  ];
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(accounts), {
      headers: { 'Content-Type': 'application/json' },
    })
  );

  expect(connectedMailPath('workspace/one')).toBe(
    '/api/v1/workspaces/workspace%2Fone/mail/connected'
  );
  await expect(
    connectedMailRequest(
      'workspace/one',
      [],
      { query: { cursor: 'a+b', unused: undefined } },
      { fetch }
    )
  ).resolves.toEqual(accounts);

  const [url, init] = fetch.mock.calls[0] ?? [];
  expect(String(url)).toContain(
    '/api/v1/workspaces/workspace%2Fone/mail/connected?cursor=a%2Bb'
  );
  expect(init).toMatchObject({
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  expect(init.body).toBeUndefined();
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
