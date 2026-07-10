import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serverLoggerError: vi.fn(),
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

import {
  DEFAULT_GUEST_MEMBERSHIP_WARNINGS,
  syncWorkspaceUserGuestMembership,
} from './guest-membership';

function createGuestGroupsQuery(
  result: Promise<{ data: Array<{ id: string | null }> | null; error: unknown }>
) {
  let eqCallCount = 0;
  const query = {
    eq: vi.fn(() => {
      eqCallCount += 1;
      return eqCallCount >= 2 ? result : query;
    }),
    select: vi.fn(() => query),
  };

  return query;
}

describe('syncWorkspaceUserGuestMembership', () => {
  const upsertMock = vi.fn();
  const deleteMock = vi.fn();
  const deleteEqMock = vi.fn();
  const deleteInMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    upsertMock.mockResolvedValue({ error: null });
    deleteInMock.mockResolvedValue({ error: null });
    deleteEqMock.mockReturnValue({ in: deleteInMock });
    deleteMock.mockReturnValue({ eq: deleteEqMock });
  });

  function createAdminClient({
    guestGroups = [{ id: 'guest-group-1' }, { id: 'guest-group-2' }],
    guestGroupsError = null,
  }: {
    guestGroups?: Array<{ id: string | null }>;
    guestGroupsError?: unknown;
  } = {}) {
    const guestGroupsQuery = createGuestGroupsQuery(
      Promise.resolve({
        data: guestGroups,
        error: guestGroupsError,
      })
    );
    const fromMock = vi.fn((table: string) => {
      if (table === 'workspace_user_groups') {
        return guestGroupsQuery;
      }

      if (table === 'workspace_user_groups_users') {
        return {
          delete: deleteMock,
          upsert: upsertMock,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    return {
      client: { from: fromMock } as unknown as TypedSupabaseClient,
      fromMock,
      guestGroupsQuery,
    };
  }

  it('adds marked guest users to every guest group without overwriting existing roles', async () => {
    const { client, guestGroupsQuery } = createAdminClient();

    const warning = await syncWorkspaceUserGuestMembership({
      isGuest: true,
      sbAdmin: client,
      userId: 'user-1',
      wsId: 'ws-1',
    });

    expect(warning).toBeUndefined();
    expect(guestGroupsQuery.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(guestGroupsQuery.eq).toHaveBeenCalledWith('is_guest', true);
    expect(upsertMock).toHaveBeenCalledWith(
      [
        { group_id: 'guest-group-1', user_id: 'user-1' },
        { group_id: 'guest-group-2', user_id: 'user-1' },
      ],
      {
        ignoreDuplicates: true,
        onConflict: 'group_id,user_id',
      }
    );
  });

  it('removes unmarked users from every guest group', async () => {
    const { client } = createAdminClient();

    const warning = await syncWorkspaceUserGuestMembership({
      isGuest: false,
      sbAdmin: client,
      userId: 'user-1',
      wsId: 'ws-1',
    });

    expect(warning).toBeUndefined();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteEqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(deleteInMock).toHaveBeenCalledWith('group_id', [
      'guest-group-1',
      'guest-group-2',
    ]);
  });

  it('returns a resolve warning when guest groups cannot be loaded', async () => {
    const { client } = createAdminClient({
      guestGroups: [],
      guestGroupsError: { message: 'multiple rows' },
    });

    const warning = await syncWorkspaceUserGuestMembership({
      isGuest: true,
      sbAdmin: client,
      userId: 'user-1',
      wsId: 'ws-1',
    });

    expect(warning).toBe(DEFAULT_GUEST_MEMBERSHIP_WARNINGS.resolveFailed);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error resolving guest workspace user groups:',
      expect.objectContaining({
        userId: 'user-1',
        wsId: 'ws-1',
      })
    );
  });

  it('returns a link warning when guest membership cannot be added', async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: 'insert failed' } });
    const { client } = createAdminClient();

    const warning = await syncWorkspaceUserGuestMembership({
      isGuest: true,
      sbAdmin: client,
      userId: 'user-1',
      wsId: 'ws-1',
    });

    expect(warning).toBe(DEFAULT_GUEST_MEMBERSHIP_WARNINGS.linkFailed);
  });

  it('returns an unlink warning when guest membership cannot be removed', async () => {
    deleteInMock.mockResolvedValueOnce({ error: { message: 'delete failed' } });
    const { client } = createAdminClient();

    const warning = await syncWorkspaceUserGuestMembership({
      isGuest: false,
      sbAdmin: client,
      userId: 'user-1',
      wsId: 'ws-1',
    });

    expect(warning).toBe(DEFAULT_GUEST_MEMBERSHIP_WARNINGS.unlinkFailed);
  });

  it('warns only when marking a user as guest and no guest groups exist', async () => {
    const markedClient = createAdminClient({ guestGroups: [] }).client;
    const unmarkedClient = createAdminClient({ guestGroups: [] }).client;

    await expect(
      syncWorkspaceUserGuestMembership({
        isGuest: true,
        sbAdmin: markedClient,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toBe(DEFAULT_GUEST_MEMBERSHIP_WARNINGS.noGuestGroups);

    await expect(
      syncWorkspaceUserGuestMembership({
        isGuest: false,
        sbAdmin: unmarkedClient,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toBeUndefined();
  });
});
