import { beforeEach, expect, it, vi } from 'vitest';

const userId = 'ef7f415e-63f9-4b08-83d9-6f6dcb90b7e7';
const mailboxId = '987b57f5-0d1b-4ca9-8824-d874af4d2db9';
const threadId = '94bec149-0dfb-4a06-b324-8f9b44d393ad';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  contains: vi.fn(),
  select: vi.fn(),
}));

vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.auth,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: mocks.from }),
}));

import { POST } from './route';

const request = (body: unknown, origin?: string) =>
  new Request('https://tuturuuu.com/api/v1/notifications/mail-thread', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: userId } });
  mocks.from.mockReturnValue(mocks);
  mocks.update.mockReturnValue(mocks);
  mocks.eq.mockReturnValue(mocks);
  mocks.is.mockReturnValue(mocks);
  mocks.contains.mockReturnValue(mocks);
  mocks.select.mockResolvedValue({ data: [{ id: 'one' }], error: null });
});

it('archives only matching unread Mail notifications for the signed-in user', async () => {
  const response = await POST(request({ mailboxId, threadId }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ archived: 1 });
  expect(mocks.from).toHaveBeenCalledWith('notifications');
  expect(mocks.eq).toHaveBeenCalledWith('user_id', userId);
  expect(mocks.eq).toHaveBeenCalledWith('type', 'mail_received');
  expect(mocks.eq).toHaveBeenCalledWith('entity_type', 'mail_message');
  expect(mocks.is).toHaveBeenCalledWith('ws_id', null);
  expect(mocks.is).toHaveBeenCalledWith('read_at', null);
  expect(mocks.contains).toHaveBeenCalledWith('data', {
    mailboxId,
    threadId,
    userId,
  });
});

it('rejects unauthenticated or invalid requests without an admin mutation', async () => {
  mocks.auth.mockResolvedValueOnce({
    ok: false,
    response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
  });
  expect((await POST(request({ mailboxId, threadId }))).status).toBe(401);
  expect((await POST(request({ mailboxId: 'other', threadId }))).status).toBe(
    400
  );
  expect(
    (await POST(request({ mailboxId, threadId }, 'https://evil.test'))).status
  ).toBe(403);
  expect(mocks.from).not.toHaveBeenCalled();
});
