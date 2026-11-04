import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { expect, it, vi } from 'vitest';
import { loadTaskReadScope } from '../task-read-scope';

function fixture({
  membership = 'GUEST',
  email = 'verified@example.com',
  confirmed = true,
  failMembership = false,
  failShares = false,
} = {}) {
  const rows = [
    {
      board_id: 'direct',
      shared_with_user_id: 'actor',
      shared_with_email: null,
      ws_id: 'workspace',
      deleted_at: null,
      permission: 'view',
    },
    {
      board_id: 'email',
      shared_with_user_id: null,
      shared_with_email: 'verified@example.com',
      ws_id: 'workspace',
      deleted_at: null,
      permission: 'edit',
    },
    {
      board_id: 'foreign',
      shared_with_user_id: 'actor',
      shared_with_email: null,
      ws_id: 'elsewhere',
      deleted_at: null,
      permission: 'view',
    },
    {
      board_id: 'deleted',
      shared_with_user_id: 'actor',
      shared_with_email: null,
      ws_id: 'workspace',
      deleted_at: '2026-01-01',
      permission: 'view',
    },
  ];
  const from = vi.fn((table: string) => {
    let selected = rows;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        if (table === 'task_board_shares')
          selected = selected.filter(
            (row) =>
              row[
                key === 'workspace_boards.ws_id'
                  ? 'ws_id'
                  : (key as keyof typeof row)
              ] === value
          );
        return query;
      },
      is: (key: string, value: unknown) => {
        selected = selected.filter(
          (row) =>
            row[
              key === 'workspace_boards.deleted_at'
                ? 'deleted_at'
                : (key as keyof typeof row)
            ] === value
        );
        return query;
      },
      in: (_key: string, values: string[]) => {
        selected = selected.filter((row) => values.includes(row.permission));
        return query;
      },
      maybeSingle: () =>
        Promise.resolve({
          data: membership ? { type: membership } : null,
          error: failMembership ? new Error('lookup failed') : null,
        }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase queries are awaitable.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: selected,
          error: failShares ? new Error('shares failed') : null,
        }).then(resolve),
    };
    return query;
  });
  const getUserById = vi.fn().mockResolvedValue({
    data: {
      user: { email, email_confirmed_at: confirmed ? '2026-01-01' : null },
    },
    error: null,
  });
  const sbAdmin = {
    from,
    auth: { admin: { getUserById } },
  } as unknown as TypedSupabaseClient;
  return { sbAdmin, from, getUserById };
}
it('allows regular members workspace-wide reads without expanding guest membership', async () => {
  const f = fixture({ membership: 'MEMBER' });
  expect(
    await loadTaskReadScope({
      sbAdmin: f.sbAdmin,
      userId: 'actor',
      wsId: 'workspace',
    })
  ).toEqual({ mode: 'workspace' });
  expect(f.getUserById).not.toHaveBeenCalled();
});
it.each(['GUEST', ''])(
  'limits membership %s to explicit shares on live boards in this workspace',
  async (membership) => {
    const f = fixture({ membership });
    expect(
      await loadTaskReadScope({
        sbAdmin: f.sbAdmin,
        userId: 'actor',
        wsId: 'workspace',
      })
    ).toEqual({ mode: 'boards', boardIds: ['direct', 'email'] });
  }
);
it.each([{ confirmed: false }, { email: 'profile@example.com' }])(
  'rejects unconfirmed or different emails while keeping direct shares',
  async (input) => {
    const f = fixture(input);
    expect(
      await loadTaskReadScope({
        sbAdmin: f.sbAdmin,
        userId: 'actor',
        wsId: 'workspace',
      })
    ).toEqual({ mode: 'boards', boardIds: ['direct'] });
  }
);
it.each([{ failMembership: true }, { failShares: true }])(
  'fails closed on authorization lookup errors',
  async (input) => {
    const f = fixture(input);
    await expect(
      loadTaskReadScope({
        sbAdmin: f.sbAdmin,
        userId: 'actor',
        wsId: 'workspace',
      })
    ).rejects.toThrow();
  }
);
