import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), mark: vi.fn() }));
vi.mock('@/lib/mail/auth', () => ({ resolveMailRouteContext: mocks.auth }));
vi.mock('@/lib/mail/repository/folder-read', () => ({
  markMailFolderRead: mocks.mark,
}));

import { POST } from './route';

const params = {
  params: Promise.resolve({ wsId: 'personal', mailboxId: 'mailbox' }),
};
const request = (payload: unknown) =>
  new NextRequest(
    'https://mail.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox/read-all',
    { method: 'POST', body: JSON.stringify(payload) }
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    context: { user: { id: 'viewer' } },
  });
});
it.each([
  { folder: 'trash' },
  { folder: 'inbox', cursor: 'invalid' },
  { folder: 'archive', before: 'invalid' },
])('rejects invalid folder read scopes', async (payload) => {
  expect((await POST(request(payload), params)).status).toBe(400);
  expect(mocks.mark).not.toHaveBeenCalled();
});
it('requires the app session before marking read', async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  });
  expect((await POST(request({ folder: 'inbox' }), params)).status).toBe(401);
  expect(mocks.mark).not.toHaveBeenCalled();
});
it('returns forbidden when mailbox access is denied', async () => {
  mocks.mark.mockResolvedValue(null);
  expect((await POST(request({ folder: 'archive' }), params)).status).toBe(403);
});
it('returns the continuation cursor without claiming the whole folder is complete', async () => {
  const result = {
    updated: 250,
    before: '2026-09-15T00:00:00.000Z',
    nextCursor: '00000000-0000-4000-8000-000000000001',
  };
  mocks.mark.mockResolvedValue(result);
  const response = await POST(request({ folder: 'archive' }), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(mocks.mark).toHaveBeenCalledWith({
    ctx: { user: { id: 'viewer' } },
    mailboxId: 'mailbox',
    payload: { folder: 'archive' },
  });
});
