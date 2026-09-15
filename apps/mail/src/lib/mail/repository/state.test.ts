import { beforeEach, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  get: vi.fn(),
  table: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./messages', () => ({ getMailMessage: mocks.get }));
vi.mock('./shared', () => ({ privateTable: mocks.table }));

import { updateMailMessageState } from './state';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ admin: {} });
  mocks.table.mockReturnValue({ upsert: mocks.upsert });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.get.mockResolvedValue({ id: 'message', unread: false });
});
it('archives and marks read in one scoped state write', async () => {
  const result = await updateMailMessageState({
    ctx: { user: { id: 'viewer' } } as MailRouteContext,
    mailboxId: 'mailbox',
    messageId: 'message',
    payload: { action: 'archive' },
  });
  const patch = mocks.upsert.mock.calls[0]![0];
  expect(patch).toEqual({
    mailbox_id: 'mailbox',
    message_id: 'message',
    user_id: 'viewer',
    archived_at: expect.any(String),
    read_at: patch.archived_at,
  });
  expect(result).toEqual({ id: 'message', unread: false });
});
it('allows an explicit unread action without changing the archive timestamp', async () => {
  await updateMailMessageState({
    ctx: { user: { id: 'viewer' } } as MailRouteContext,
    mailboxId: 'mailbox',
    messageId: 'message',
    payload: { action: 'mark_unread' },
  });
  expect(mocks.upsert.mock.calls[0]![0]).toEqual({
    mailbox_id: 'mailbox',
    message_id: 'message',
    user_id: 'viewer',
    read_at: null,
  });
});
