import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { resolveDiscordGuildMemberUser } from './discord-user-mapping';

const input = {
  discordGuildId: 'guild-1',
  discordUserId: 'discord-user-1',
  workspaceId: 'workspace-1',
};

// Each execution captures one database snapshot. Reconnect runs immediately
// after the first statement, exposing the former two-statement resolution race.
function createDb({
  workspace = 'workspace-1',
  user = 'user-1',
  reconnectWorkspace,
  error = null,
}: {
  workspace?: string | null;
  user?: string | null;
  reconnectWorkspace?: string;
  error?: { message: string } | null;
} = {}) {
  const queries: Array<{
    table: string;
    select: string;
    filters: Record<string, unknown>;
  }> = [];
  let executions = 0;
  const from = vi.fn((table: string) => {
    const statement = {
      table,
      select: '',
      filters: {} as Record<string, unknown>,
    };
    queries.push(statement);
    const query = {
      select: (columns: string) => {
        statement.select = columns;
        return query;
      },
      eq: (column: string, value: unknown) => {
        statement.filters[column] = value;
        return query;
      },
      maybeSingle: async () => {
        const joined = statement.select.includes('discord_integrations!inner');
        const data =
          table === 'discord_integrations'
            ? workspace === statement.filters.ws_id
              ? { id: 'integration-1' }
              : null
            : user &&
                (!joined ||
                  (workspace !== null &&
                    workspace ===
                      statement.filters['discord_integrations.ws_id']))
              ? { platform_user_id: user }
              : null;
        if (++executions === 1 && reconnectWorkspace) {
          workspace = reconnectWorkspace;
          user = 'reconnected-user';
        }
        return { data, error };
      },
    };
    return query;
  });
  return { db: { from } as unknown as TypedSupabaseClient, queries, from };
}

describe('resolveDiscordGuildMemberUser', () => {
  it('resolves within one statement scoped to guild, Discord user and workspace', async () => {
    const { db, queries } = createDb();
    await expect(resolveDiscordGuildMemberUser({ db, ...input })).resolves.toBe(
      'user-1'
    );
    expect(queries).toEqual([
      {
        table: 'discord_guild_members',
        select: 'platform_user_id, discord_integrations!inner(ws_id)',
        filters: {
          discord_guild_id: 'guild-1',
          discord_user_id: 'discord-user-1',
          'discord_integrations.ws_id': 'workspace-1',
        },
      },
    ]);
  });

  it('cannot return the new workspace mapping when a reconnect follows the first read', async () => {
    const { db, from } = createDb({ reconnectWorkspace: 'workspace-2' });
    await expect(resolveDiscordGuildMemberUser({ db, ...input })).resolves.toBe(
      'user-1'
    );
    expect(from).toHaveBeenCalledTimes(1);
    await expect(
      resolveDiscordGuildMemberUser({ db, ...input })
    ).resolves.toBeNull();
    await expect(
      resolveDiscordGuildMemberUser({
        db,
        ...input,
        workspaceId: 'workspace-2',
      })
    ).resolves.toBe('reconnected-user');
  });

  it('still resolves a new mapping after reconnect to the same workspace', async () => {
    const { db } = createDb({ reconnectWorkspace: 'workspace-1' });
    await expect(resolveDiscordGuildMemberUser({ db, ...input })).resolves.toBe(
      'user-1'
    );
    await expect(resolveDiscordGuildMemberUser({ db, ...input })).resolves.toBe(
      'reconnected-user'
    );
  });

  it('ignores a mapping bound to another workspace', async () => {
    const { db } = createDb({ workspace: 'workspace-2', user: 'foreign-user' });
    await expect(
      resolveDiscordGuildMemberUser({ db, ...input })
    ).resolves.toBeNull();
  });

  it('ignores an orphaned mapping', async () => {
    const { db } = createDb({ workspace: null });
    await expect(
      resolveDiscordGuildMemberUser({ db, ...input })
    ).resolves.toBeNull();
  });

  it('returns null without a mapping', async () => {
    const { db } = createDb({ user: null });
    await expect(
      resolveDiscordGuildMemberUser({ db, ...input })
    ).resolves.toBeNull();
  });

  it.each(['db down', 'multiple rows returned'])(
    'fails closed on %s',
    async (message) => {
      const { db } = createDb({ error: { message } });
      await expect(
        resolveDiscordGuildMemberUser({ db, ...input })
      ).rejects.toThrow(message);
    }
  );
});
