import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  insert: vi.fn(),
  lookup: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('@/lib/mail/auth', () => ({ resolveMailRouteContext: mocks.auth }));
vi.mock('@/lib/mail/repository/blacklist', () => ({
  getMailBlacklistContext: mocks.access,
  MAIL_BLACKLIST_REASONS: { inactive: 'Inactive/Abandoned' },
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/utils/next-config', () => ({
  resolveTuturuuuInfrastructureAppUrl: () =>
    'https://infra.staging.example.com',
}));

import { GET, POST } from './route';

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
    admin: {
      from: () => ({
        insert: mocks.insert,
        select: () => ({ eq: () => ({ ilike: mocks.lookup }) }),
      }),
    },
    recipients: ['failed@example.com'],
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.lookup.mockResolvedValue({ data: [], error: null });
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

it('recognizes existing differently cased entries and preserves their metadata', async () => {
  mocks.lookup.mockResolvedValue({
    data: [{ value: 'Failed@Example.com' }],
    error: null,
  });
  expect(await (await POST(request(), params)).json()).toEqual({
    blocked: true,
    alreadyBlocked: true,
  });
  expect(mocks.insert).not.toHaveBeenCalled();
  const result = await (await GET(request(), params)).json();
  expect(result.recipients).toEqual([
    { email: 'failed@example.com', blocked: true },
  ]);
  expect(result.infrastructureOrigin).toBe('https://infra.staging.example.com');
});
it('escapes LIKE wildcards when looking up exact email entries', async () => {
  mocks.access.mockResolvedValue({
    admin: {
      from: () => ({
        insert: mocks.insert,
        select: () => ({ eq: () => ({ ilike: mocks.lookup }) }),
      }),
    },
    recipients: ['failed_100%tag@example.com'],
  });
  await POST(request('failed_100%tag@example.com'), params);
  expect(mocks.lookup).toHaveBeenCalledWith(
    'value',
    'failed\\_100\\%tag@example.com'
  );
});
