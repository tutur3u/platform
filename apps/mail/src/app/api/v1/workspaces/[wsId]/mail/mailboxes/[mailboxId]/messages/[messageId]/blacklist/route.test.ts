import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  insert: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('@/lib/mail/auth', () => ({ resolveMailRouteContext: mocks.auth }));
vi.mock('@/lib/mail/repository/blacklist', () => ({
  getMailBlacklistContext: mocks.access,
  MAIL_BLACKLIST_REASONS: { inactive: 'Inactive/Abandoned' },
}));

import { POST } from './route';

const params = {
  params: Promise.resolve({
    wsId: 'personal',
    mailboxId: 'mailbox',
    messageId: 'message',
  }),
};
function request(email = 'failed@example.com') {
  return new NextRequest('https://mail.example.com/blacklist', {
    method: 'POST',
    body: JSON.stringify({ email, reason: 'inactive' }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    context: { user: { id: 'viewer' } },
  });
  mocks.access.mockResolvedValue({
    admin: { from: () => ({ insert: mocks.insert }) },
    recipients: ['failed@example.com'],
  });
  mocks.insert.mockResolvedValue({ error: null });
});
it('denies non-Infrastructure users without writing global blacklist data', async () => {
  mocks.access.mockResolvedValue(null);
  expect((await POST(request(), params)).status).toBe(403);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it('rejects an arbitrary address absent from the authorized delivery failure', async () => {
  expect((await POST(request('innocent@example.com'), params)).status).toBe(
    400
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});
it('uses the shared Infrastructure reason and stamps the authenticated actor', async () => {
  const response = await POST(request('Failed@Example.com'), params);
  expect(response.status).toBe(200);
  expect(mocks.insert).toHaveBeenCalledWith({
    entry_type: 'email',
    value: 'failed@example.com',
    reason: 'Inactive/Abandoned',
    added_by_user_id: 'viewer',
  });
});
it('treats existing entries as success without overwriting their reason or actor', async () => {
  mocks.insert.mockResolvedValue({ error: { code: '23505' } });
  const response = await POST(request(), params);
  expect(await response.json()).toEqual({
    blocked: true,
    alreadyBlocked: true,
  });
});
