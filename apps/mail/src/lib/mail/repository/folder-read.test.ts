import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  states: vi.fn(),
  table: vi.fn(),
  privateTable: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./messages', () => ({ getStatesByMessageId: mocks.states }));
vi.mock('./shared', () => ({
  privateTable: mocks.privateTable,
}));

import { isUnreadInFolder, markMailFolderRead } from './folder-read';

const ctx = { user: { id: 'viewer' } } as MailRouteContext;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ admin: {}, mailbox: {} });
  mocks.states.mockResolvedValue(new Map());
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.privateTable.mockImplementation((_admin, table) =>
    table === 'mail_messages' ? mocks.table() : { upsert: mocks.upsert }
  );
});
describe('folder-wide mark read', () => {
  it('includes only unread messages in the requested folder', () => {
    const message = { direction: 'inbound', status: 'received' };
    expect(isUnreadInFolder(message, undefined, 'inbox')).toBe(true);
    expect(isUnreadInFolder(message, { archived_at: 'date' }, 'inbox')).toBe(
      false
    );
    expect(isUnreadInFolder(message, { archived_at: 'date' }, 'archive')).toBe(
      true
    );
    expect(isUnreadInFolder(message, { read_at: 'date' }, 'inbox')).toBe(false);
    expect(
      isUnreadInFolder(
        message,
        { archived_at: 'date', trashed_at: 'date' },
        'archive'
      )
    ).toBe(false);
    expect(
      isUnreadInFolder(
        { ...message, status: 'quarantined' },
        undefined,
        'inbox'
      )
    ).toBe(false);
    expect(
      isUnreadInFolder(
        { ...message, direction: 'outbound' },
        undefined,
        'inbox'
      )
    ).toBe(false);
  });
  it('rejects unauthorized mailboxes before scanning or writing', async () => {
    mocks.access.mockResolvedValue(null);
    expect(
      await markMailFolderRead({
        ctx,
        mailboxId: 'mailbox',
        payload: { folder: 'inbox' },
      })
    ).toBeNull();
    expect(mocks.table).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('continues past loaded pages and does not skip messages as earlier pages become read', async () => {
    const source = Array.from({ length: 603 }, (_, i) => ({
      id: String(i).padStart(4, '0'),
      direction: 'inbound',
      status: 'received',
    }));
    mocks.access.mockResolvedValue({ admin: {}, mailbox: { groupPolicy: {} } });
    const boundaries: string[] = [];
    const filters: unknown[][] = [];
    mocks.table.mockImplementation(() => {
      let cursor = '';
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: (...args: unknown[]) => {
          filters.push(args);
          return query;
        },
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lte: (_key: string, value: string) => {
          boundaries.push(value);
          return query;
        },
        gt: (_key: string, value: string) => {
          cursor = value;
          return query;
        },
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: source.filter((row) => row.id > cursor).slice(0, 250),
            error: null,
          }).then(resolve),
      };
      return query;
    });
    let cursor: string | undefined;
    let before: string | undefined;
    let updated = 0;
    do {
      const result = await markMailFolderRead({
        ctx,
        mailboxId: 'mailbox',
        payload: { folder: 'inbox', cursor, before },
      });
      updated += result!.updated;
      cursor = result!.nextCursor ?? undefined;
      before = result!.before;
    } while (cursor);
    expect(updated).toBe(603);
    expect(filters.some(([key]) => key === 'created_by')).toBe(false);
    expect(filters).toContainEqual(['mailbox_id', 'mailbox']);
    expect(mocks.upsert.mock.calls.map(([rows]) => rows.length)).toEqual([
      250, 250, 103,
    ]);
    expect(new Set(boundaries).size).toBe(1);
    expect(mocks.upsert.mock.calls[0]![0][0]).toMatchObject({
      mailbox_id: 'mailbox',
      user_id: 'viewer',
      message_id: '0000',
    });
  });
  it('surfaces failed reads without reporting success', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ error: { message: 'offline' } }),
    };
    mocks.table.mockReturnValue(query);
    await expect(
      markMailFolderRead({
        ctx,
        mailboxId: 'mailbox',
        payload: { folder: 'archive' },
      })
    ).rejects.toThrow('offline');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
