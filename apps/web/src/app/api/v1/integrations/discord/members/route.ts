import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Custom UUID validation that accepts all valid UUID formats
const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Invalid UUID format'
  );

const AddDiscordMemberSchema = z.object({
  wsId: uuidSchema,
  discordGuildId: z.string().min(1),
  platformUserId: uuidSchema,
  discordUserId: z.string().min(1),
});

const RemoveDiscordMemberSchema = z.object({
  wsId: uuidSchema,
  discordGuildId: z.string().min(1),
  memberId: uuidSchema,
});

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const wsId = searchParams.get('wsId');
    const discordGuildId = searchParams.get('discordGuildId');

    if (!wsId || !discordGuildId) {
      return NextResponse.json(
        { message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if user has Discord integration permission
    const { data: platformUserRole } = await supabase
      .from('platform_user_roles')
      .select('allow_discord_integrations')
      .eq('user_id', user.id)
      .single();

    if (!platformUserRole?.allow_discord_integrations) {
      return NextResponse.json(
        { message: 'Discord integration not allowed for this user' },
        { status: 403 }
      );
    }

    // Check if user has access to the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { message: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Verify the Discord integration belongs to the workspace
    const { data: integration } = await supabase
      .from('discord_integrations')
      .select('id')
      .eq('ws_id', wsId)
      .eq('discord_guild_id', discordGuildId)
      .single();

    if (!integration) {
      return NextResponse.json(
        { message: 'Discord integration not found' },
        { status: 404 }
      );
    }

    // Get Discord guild members
    const { data: guildMembers, error } = await supabase
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
      .eq('discord_guild_id', discordGuildId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching Discord guild members:', error);
      return NextResponse.json(
        { message: 'Failed to fetch guild members' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: guildMembers });
  } catch (error) {
    console.error('Error in Discord members GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { wsId, discordGuildId, platformUserId, discordUserId } =
      AddDiscordMemberSchema.parse(body);

    const supabase = await createClient();

    // Check if user has Discord integration permission
    const { data: platformUserRole } = await supabase
      .from('platform_user_roles')
      .select('allow_discord_integrations')
      .eq('user_id', user.id)
      .single();

    if (!platformUserRole?.allow_discord_integrations) {
      return NextResponse.json(
        { message: 'Discord integration not allowed for this user' },
        { status: 403 }
      );
    }

    // Check if user has access to the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { message: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Verify the Discord integration belongs to the workspace
    const { data: integration } = await supabase
      .from('discord_integrations')
      .select('id')
      .eq('ws_id', wsId)
      .eq('discord_guild_id', discordGuildId)
      .single();

    if (!integration) {
      return NextResponse.json(
        { message: 'Discord integration not found' },
        { status: 404 }
      );
    }

    // Check if the platform user is a member of the workspace
    const { data: workspaceUser } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', platformUserId)
      .single();

    if (!workspaceUser) {
      return NextResponse.json(
        { message: 'User is not a member of this workspace' },
        { status: 400 }
      );
    }

    // Check if Discord user is already linked to this guild
    const { data: existingMember } = await supabase
      .from('discord_guild_members')
      .select('id')
      .eq('discord_guild_id', discordGuildId)
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { message: 'Discord user is already linked to this guild' },
        { status: 400 }
      );
    }

    // Check if platform user is already linked to this guild
    const { data: existingPlatformMember } = await supabase
      .from('discord_guild_members')
      .select('id')
      .eq('discord_guild_id', discordGuildId)
      .eq('platform_user_id', platformUserId)
      .maybeSingle();

    if (existingPlatformMember) {
      return NextResponse.json(
        { message: 'Platform user is already linked to this guild' },
        { status: 400 }
      );
    }

    // Add the Discord guild member
    const { data: newMember, error } = await supabase
      .from('discord_guild_members')
      .insert({
        discord_guild_id: discordGuildId,
        discord_user_id: discordUserId,
        platform_user_id: platformUserId,
      })
      .select(`
        *,
        users:platform_user_id (
          id,
          display_name,
          avatar_url,
          handle
        )
      `)
      .single();

    if (error) {
      console.error('Error adding Discord guild member:', error);
      return NextResponse.json(
        { message: 'Failed to add guild member' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: newMember });
  } catch (error) {
    console.error('Error in Discord members POST:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { wsId, discordGuildId, memberId } =
      RemoveDiscordMemberSchema.parse(body);

    const supabase = await createClient();

    // Check if user has Discord integration permission
    const { data: platformUserRole } = await supabase
      .from('platform_user_roles')
      .select('allow_discord_integrations')
      .eq('user_id', user.id)
      .single();

    if (!platformUserRole?.allow_discord_integrations) {
      return NextResponse.json(
        { message: 'Discord integration not allowed for this user' },
        { status: 403 }
      );
    }

    // Check if user has access to the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { message: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Verify the Discord integration belongs to the workspace
    const { data: integration } = await supabase
      .from('discord_integrations')
      .select('id')
      .eq('ws_id', wsId)
      .eq('discord_guild_id', discordGuildId)
      .single();

    if (!integration) {
      return NextResponse.json(
        { message: 'Discord integration not found' },
        { status: 404 }
      );
    }

    // Delete the Discord guild member
    const { error } = await supabase
      .from('discord_guild_members')
      .delete()
      .eq('id', memberId)
      .eq('discord_guild_id', discordGuildId);

    if (error) {
      console.error('Error removing Discord guild member:', error);
      return NextResponse.json(
        { message: 'Failed to remove guild member' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error in Discord members DELETE:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
