import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

// Resolve the mapping and workspace binding in one statement snapshot so a
// disconnect/reconnect cannot substitute another workspace's identity.
export async function resolveDiscordGuildMemberUser({
  db,
  discordGuildId,
  discordUserId,
  workspaceId,
}: {
  db: TypedSupabaseClient;
  discordGuildId: string;
  discordUserId: string;
  workspaceId: string;
}) {
  const { data, error } = await db
    .from('discord_guild_members')
    .select('platform_user_id, discord_integrations!inner(ws_id)')
    .eq('discord_guild_id', discordGuildId)
    .eq('discord_user_id', discordUserId)
    .eq('discord_integrations.ws_id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.platform_user_id ?? null;
}
