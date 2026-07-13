import { describe, expect, it } from 'vitest';
import { getThreadUnreadCounts } from './threads';

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
