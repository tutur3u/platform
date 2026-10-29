import { expect, it, vi } from 'vitest';
import { acceptTulearnParentInvite, acceptTulearnParentLink } from './tulearn';

const link = { id: 'link-1', status: 'active' };

it('posts the invite token to the encoded accept route', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ link }));
  await expect(
    acceptTulearnParentInvite('workspace/a', 'a'.repeat(64), {
      baseUrl: 'https://synthetic.invalid',
      fetch,
    })
  ).resolves.toEqual({ link });

  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://synthetic.invalid/api/v1/workspaces/workspace%2Fa/tulearn/parent-invites/accept'
  );
  const init = fetch.mock.calls[0]?.[1] as RequestInit;
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body as string)).toEqual({ token: 'a'.repeat(64) });
});

it('posts to the parent link accept route', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ link }));
  await acceptTulearnParentLink('workspace-a', 'link/1', {
    baseUrl: 'https://synthetic.invalid',
    fetch,
  });

  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://synthetic.invalid/api/v1/workspaces/workspace-a/tulearn/parent-links/link%2F1/accept'
  );
  const init = fetch.mock.calls[0]?.[1] as RequestInit;
  expect(init.method).toBe('POST');
});
