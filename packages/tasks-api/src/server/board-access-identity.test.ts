import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

import {
  loadTaskBoardGuestSharesForBoard,
  loadTaskBoardGuestSharesForWorkspace,
} from './board-access';

function client(confirmed = true) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: {
            user: {
              id,
              email: 'actual@example.com',
              email_confirmed_at: confirmed ? '2026-01-01' : null,
            },
          },
          error: null,
        })),
      },
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        in: () => query,
        is: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        maybeSingle: async () => ({
          data: { email: 'recipient@example.com' },
          error: null,
        }),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === 'task_board_shares' &&
              filters.shared_with_email === 'recipient@example.com'
                ? [
                    {
                      id: 'share',
                      board_id: 'board',
                      permission: 'edit',
                      workspace_boards: { id: 'board', ws_id: 'workspace' },
                    },
                  ]
                : [],
            error: null,
          }).then(resolve),
      };
      return query;
    },
  } as unknown as TypedSupabaseClient;
}

describe('board recipient identity', () => {
  it.each([
    loadTaskBoardGuestSharesForBoard,
    loadTaskBoardGuestSharesForWorkspace,
  ])('ignores caller and signed-session emails', async (load) => {
    const shares = await load({
      sbAdmin: client(),
      user: { id: 'actor', email: 'recipient@example.com' },
      email: 'recipient@example.com',
      boardId: 'board',
      workspaceId: 'workspace',
    });
    expect(shares).toEqual([]);
  });
  it('does not fall back to editable profile email', async () => {
    const shares = await loadTaskBoardGuestSharesForWorkspace({
      sbAdmin: client(false),
      user: { id: 'actor', email: null },
      workspaceId: 'workspace',
    });
    expect(shares).toEqual([]);
  });
});
