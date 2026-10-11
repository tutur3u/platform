import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), finish: vi.fn() }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/mail/auth', () => ({ resolveMailAuth: mocks.auth }));
vi.mock('@/lib/mail/connected/oauth', () => ({ finishOAuth: mocks.finish }));

import { ConnectedMailError } from '@/lib/mail/connected/config';
import { GET } from './route';

const request = new NextRequest(
  'https://mail.example.test/api/v1/mail/connected/callback'
);
beforeEach(() => vi.clearAllMocks());
it('does not consume OAuth state for an unauthenticated callback', async () => {
  mocks.auth.mockResolvedValue({
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  });
  expect((await GET(request)).status).toBe(401);
  expect(mocks.finish).not.toHaveBeenCalled();
});
it('passes only the authenticated actor identity to OAuth completion', async () => {
  mocks.auth.mockResolvedValue({ user: { id: 'owner' } });
  mocks.finish.mockResolvedValue(
    NextResponse.redirect('https://mail.example.test/personal/inbox')
  );
  expect((await GET(request)).status).toBe(307);
  expect(mocks.finish).toHaveBeenCalledWith(request, 'owner');
});
it('reports known authorization failures and hides unexpected server details', async () => {
  mocks.auth.mockResolvedValue({ user: { id: 'owner' } });
  mocks.finish
    .mockRejectedValueOnce(
      new ConnectedMailError(409, 'Mail authorization expired')
    )
    .mockRejectedValueOnce(new Error('sensitive provider response'));
  const known = await GET(request);
  expect(known.status).toBe(409);
  expect(await known.json()).toEqual({ error: 'Mail authorization expired' });
  const unexpected = await GET(request);
  expect(unexpected.status).toBe(500);
  expect(await unexpected.json()).toEqual({
    error: 'Mail authorization failed',
  });
});
