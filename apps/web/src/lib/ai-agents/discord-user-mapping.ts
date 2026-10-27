import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

// A channel's configured guild only identifies users when that guild is the
// one bound to the channel's workspace; any other guild's mappings belong to a
// different workspace and must not authorize this channel's agent.
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
  const { data: integration, error: integrationError } = await db
    .from('discord_integrations')
    .select('id')
    .eq('discord_guild_id', discordGuildId)
    .eq('ws_id', workspaceId)
    .maybeSingle();

  if (integrationError) {
    throw new Error(integrationError.message);
  }

  if (!integration) {
    return null;
  }

  const { data, error } = await db
    .from('discord_guild_members')
    .select('platform_user_id')
    .eq('discord_guild_id', discordGuildId)
    .eq('discord_user_id', discordUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.platform_user_id ?? null;
}
