import type { InfiniteData } from '@tanstack/react-query';
import type { MailThreadsResponse } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { updateThreadPages } from './use-mail-thread-actions';

function cache(): InfiniteData<MailThreadsResponse> {
  return {
    pageParams: [1],
    pages: [
      {
        pagination: { page: 1, pageSize: 40, total: 2 },
        threads: [
          { id: 'a', starred: false, unreadCount: 2 },
          { id: 'b', starred: true, unreadCount: 0 },
        ] as MailThreadsResponse['threads'],
      },
    ],
  };
}

describe('optimistic mail thread updates', () => {
  it('removes archived conversations from the inbox immediately', () => {
    const result = updateThreadPages(
      cache(),
      new Set(['a']),
      'archive',
      'inbox'
    );

    expect(result?.pages[0]?.threads.map((thread) => thread.id)).toEqual(['b']);
    expect(result?.pages[0]?.pagination.total).toBe(1);
  });

  it('keeps archive conversations visible while updating state', () => {
    const result = updateThreadPages(
      cache(),
      new Set(['a']),
      'archive',
      'archive'
    );

    expect(result?.pages[0]?.threads).toHaveLength(2);
  });

  it('updates read and star state without waiting for refetch', () => {
    const read = updateThreadPages(
      cache(),
      new Set(['a']),
      'mark_read',
      'inbox'
    );
    const starred = updateThreadPages(read, new Set(['a']), 'star', 'inbox');

    expect(starred?.pages[0]?.threads[0]).toMatchObject({
      id: 'a',
      starred: true,
      unreadCount: 0,
    });
  });
});
