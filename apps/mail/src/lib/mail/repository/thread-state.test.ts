import { beforeEach, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  allRows: vi.fn(),
  bulk: vi.fn(),
  upsert: vi.fn(),
  messages: vi.fn(),
  table: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./search', () => ({ loadAllRows: mocks.allRows }));
vi.mock('./organization', () => ({ bulkUpdateMail: mocks.bulk }));
vi.mock('./messages', () => ({ hydrateMailMessage: vi.fn() }));
vi.mock('./shared', () => ({
  mailMessageTable: mocks.messages,
  privateTable: mocks.table,
}));

import { bulkUpdateMailThreads, updateMailThreadState } from './threads';

const ctx = { user: { id: 'viewer' } } as MailRouteContext;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ admin: {}, mailbox: {} });
  mocks.allRows.mockResolvedValue(
    Array.from({ length: 605 }, (_, index) => ({ id: `message-${index}` }))
  );
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.bulk.mockImplementation(async ({ payload }) => ({
    updated: payload.messageIds.length,
  }));
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { id: 'thread' }, error: null }),
    upsert: mocks.upsert,
  };
  mocks.table.mockReturnValue(query);
  mocks.messages.mockReturnValue(query);
});
it('archives every message in a long thread and marks each read', async () => {
  await updateMailThreadState({
    ctx,
    mailboxId: 'mailbox',
    threadId: 'thread',
    payload: { action: 'archive' },
  });
  expect(mocks.upsert.mock.calls.map(([rows]) => rows.length)).toEqual([
    250, 250, 105,
  ]);
  const rows = mocks.upsert.mock.calls.flatMap(([batch]) => batch);
  expect(new Set(rows.map((row) => row.message_id)).size).toBe(605);
  for (const row of rows)
    expect(row).toMatchObject({
      mailbox_id: 'mailbox',
      user_id: 'viewer',
      archived_at: expect.any(String),
      read_at: row.archived_at,
    });
});
it('bulk updates do not silently drop messages beyond the former 500-message limit', async () => {
  const result = await bulkUpdateMailThreads({
    ctx,
    mailboxId: 'mailbox',
    payload: { action: 'mark_read', threadIds: ['thread'] },
  });
  expect(result).toEqual({ updated: 605 });
  expect(
    mocks.bulk.mock.calls.map(([args]) => args.payload.messageIds.length)
  ).toEqual([250, 250, 105]);
});
