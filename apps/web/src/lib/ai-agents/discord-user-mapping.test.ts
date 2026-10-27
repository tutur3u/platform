import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { resolveDiscordGuildMemberUser } from './discord-user-mapping';

type QueryResult = { data: unknown; error: { message: string } | null };

function createDb(results: Record<string, QueryResult>) {
  const filters: Record<string, Array<[string, unknown]>> = {};
  const from = vi.fn((table: string) => {
    filters[table] = [];
    const query = {
      eq: vi.fn((column: string, value: unknown) => {
        filters[table]?.push([column, value]);
        return query;
      }),
      maybeSingle: vi.fn(async () => results[table]),
      select: vi.fn(() => query),
    };
    return query;
  });

  return { db: { from } as unknown as TypedSupabaseClient, filters, from };
}

const input = {
  discordGuildId: 'guild-1',
  discordUserId: 'discord-user-1',
  workspaceId: 'workspace-1',
};

describe('resolveDiscordGuildMemberUser', () => {
  it('resolves the mapped user when the guild is bound to the workspace', async () => {
    const { db, filters } = createDb({
      discord_guild_members: {
        data: { platform_user_id: 'user-1' },
        error: null,
      },
      discord_integrations: { data: { id: 'integration-1' }, error: null },
    });

    await expect(resolveDiscordGuildMemberUser({ db, ...input })).resolves.toBe(
      'user-1'
    );
    expect(filters.discord_integrations).toEqual([
      ['discord_guild_id', 'guild-1'],
      ['ws_id', 'workspace-1'],
    ]);
    expect(filters.discord_guild_members).toEqual([
      ['discord_guild_id', 'guild-1'],
      ['discord_user_id', 'discord-user-1'],
    ]);
  });

  it('ignores mappings for a guild bound to another workspace', async () => {
    const { db, from } = createDb({
      discord_guild_members: {
        data: { platform_user_id: 'foreign-user' },
        error: null,
      },
      discord_integrations: { data: null, error: null },
    });

    await expect(
      resolveDiscordGuildMemberUser({ db, ...input })
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalledWith('discord_guild_members');
  });

  it('surfaces integration lookup failures', async () => {
    const { db } = createDb({
      discord_integrations: { data: null, error: { message: 'db down' } },
    });

    await expect(
      resolveDiscordGuildMemberUser({ db, ...input })
    ).rejects.toThrow('db down');
  });
});
