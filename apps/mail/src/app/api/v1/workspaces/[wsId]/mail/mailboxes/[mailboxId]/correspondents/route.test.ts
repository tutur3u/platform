import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/mail/auth', () => ({ resolveMailRouteContext: mocks.auth }));
vi.mock('@/lib/mail/repository/correspondents', () => ({
  listMailCorrespondents: mocks.list,
}));

import { GET } from './route';

const params = {
  params: Promise.resolve({ wsId: 'personal', mailboxId: 'mailbox' }),
};
const request = (search = '') =>
  new NextRequest(
    `https://mail.example.com/api/v1/workspaces/personal/mail/mailboxes/mailbox/correspondents${search}`
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    context: { user: { id: 'viewer' } },
  });
});

it('requires the app session', async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  });
  expect((await GET(request(), params)).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});

it('rejects queries longer than 100 characters', async () => {
  const response = await GET(request(`?q=${'a'.repeat(101)}`), params);
  expect(response.status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
});

it('returns forbidden when the caller cannot compose from the mailbox', async () => {
  mocks.list.mockResolvedValue(null);
  const response = await GET(request(), params);
  expect(response.status).toBe(403);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});

it('returns ranked correspondents with a clamped limit and no caching', async () => {
  const data = [
    {
      email: 'phuc@example.com',
      name: 'Phúc',
      score: 2,
      lastAt: '2026-11-16T00:00:00.000Z',
      direction: 'outbound',
    },
  ];
  mocks.list.mockResolvedValue(data);
  const response = await GET(request('?q=%20phuc%20&limit=99'), params);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ data });
  expect(mocks.list).toHaveBeenCalledWith({
    ctx: { user: { id: 'viewer' } },
    mailboxId: 'mailbox',
    query: 'phuc',
    limit: 20,
  });
});
