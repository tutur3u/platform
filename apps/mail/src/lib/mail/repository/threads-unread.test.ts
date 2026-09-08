import { describe, expect, it } from 'vitest';
import { getThreadUnreadCounts, normalizeThreadPagination } from './threads';

describe('getThreadUnreadCounts', () => {
  it('counts only inbound messages without a per-user read state', () => {
    const counts = getThreadUnreadCounts(
      [
        { direction: 'inbound', id: 'unread', thread_id: 'thread-1' },
        { direction: 'inbound', id: 'read', thread_id: 'thread-1' },
        { direction: 'outbound', id: 'sent', thread_id: 'thread-1' },
        { direction: 'inbound', id: 'other', thread_id: 'thread-2' },
      ],
      new Map([['read', { read_at: '2026-07-13T00:00:00.000Z' }]])
    );

    expect(Object.fromEntries(counts)).toEqual({
      'thread-1': 1,
      'thread-2': 1,
    });
  });
});

describe('normalizeThreadPagination', () => {
  it('bounds arbitrary page inputs before scanning thread candidates', () => {
    expect(
      normalizeThreadPagination({ page: 1_000_000, pageSize: 500 })
    ).toEqual({ page: 25, pageSize: 100 });
    expect(
      normalizeThreadPagination({ page: Number.NaN, pageSize: 0 })
    ).toEqual({ page: 1, pageSize: 1 });
  });
});
