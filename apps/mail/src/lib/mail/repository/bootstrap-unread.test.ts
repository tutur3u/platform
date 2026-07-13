import { describe, expect, it, vi } from 'vitest';
import { getUnreadInboxCounts } from './bootstrap';

describe('getUnreadInboxCounts', () => {
  it('uses the per-user unread inbox resolver for every mailbox', async () => {
    const queryRows = vi.fn(async ({ mailboxId }) => ({
      rows: [],
      total: mailboxId === 'primary' ? 0 : 3,
    }));

    const counts = await getUnreadInboxCounts(
      {} as never,
      ['primary', 'shared'],
      'user-1',
      queryRows as never
    );

    expect(Object.fromEntries(counts)).toEqual({ primary: 0, shared: 3 });
    expect(queryRows).toHaveBeenCalledTimes(2);
    expect(queryRows).toHaveBeenCalledWith(
      expect.objectContaining({
        mailboxId: 'primary',
        params: {
          folder: 'inbox',
          page: 1,
          pageSize: 1,
          query: 'is:unread',
        },
        userId: 'user-1',
      })
    );
  });
});
