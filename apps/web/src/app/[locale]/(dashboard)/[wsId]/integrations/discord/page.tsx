import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import DiscordIntegrationDashboard from './discord-integration-dashboard';

export const metadata: Metadata = {
  title: 'Discord',
  description:
    'Manage Discord in the Integrations area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function DiscordIntegrationPage({ params }: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
if (!workspace) notFound();
  const wsId = workspace?.id;

  const user = await getCurrentUser();

  if (!workspace || !user) {
    redirect('/login');
  }

  // Check if user has permission for Discord integrations
  const supabase = await createClient();

  const { data: platformUserRole } = await supabase
    .from('platform_user_roles')
    .select('allow_discord_integrations')
    .eq('user_id', user.id)
    .single();

  if (!platformUserRole?.allow_discord_integrations) {
    redirect(`/${wsId}`);
  }

  // Get existing Discord integration for this workspace
  const { data: discordIntegration } = await supabase
    .from('discord_integrations')
    .select('*')
    .eq('ws_id', wsId)
    .maybeSingle();

  // Get Discord guild members if integration exists
  let guildMembers = null;
  if (discordIntegration) {
    const { data: members } = await supabase
      .from('discord_guild_members')
      .select(`
        *,
        users:platform_user_id (
          id,
          display_name,
          avatar_url,
          handle
        )
      `)
      .eq('discord_guild_id', discordIntegration.discord_guild_id);

    guildMembers = members;
  }

  return (
    <DiscordIntegrationDashboard
      wsId={wsId}
      user={user}
      integration={discordIntegration}
      guildMembers={guildMembers}
    />
  );
}
