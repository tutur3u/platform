import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { readFollowupMembers } from './followup-members';

it('scopes real members to the destination and applies name/email privacy before returning them', async () => {
  const query = (data: unknown) => {
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      // biome-ignore lint/suspicious/noThenProperty: Supabase builders are awaitable.
      then: (resolve: (result: unknown) => unknown) =>
        Promise.resolve(resolve({ data, error: null })),
    };
    for (const key of ['select', 'eq', 'in', 'order', 'limit'] as const)
      q[key].mockReturnValue(q);
    return q;
  };
  const members = query([
    {
      id: 'member',
      display_name: 'Private name',
      email: 'private@example.com',
      avatar_url: null,
    },
  ]);
  const secrets = query([
    { name: 'HIDE_MEMBER_NAME' },
    { name: 'HIDE_MEMBER_EMAIL' },
  ]);
  const db = {
    from: (table: string) =>
      table === 'workspace_secrets' ? secrets : members,
  };
  expect(await readFollowupMembers(db as never, 'destination')).toEqual([
    { id: 'member', displayName: null, email: null, avatarUrl: null },
  ]);
  expect(members.eq).toHaveBeenCalledWith('ws_id', 'destination');
  expect(members.eq).toHaveBeenCalledWith('pending', false);
  expect(members.eq).toHaveBeenCalledWith('type', 'MEMBER');
});
