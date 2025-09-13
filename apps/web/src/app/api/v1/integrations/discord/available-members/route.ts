import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const wsId = searchParams.get('wsId');
    const discordGuildId = searchParams.get('discordGuildId');
    const query = searchParams.get('query') || '';

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

    // First, get the user IDs that are already linked to this Discord guild
    const { data: linkedMembers } = await supabase
      .from('discord_guild_members')
      .select('platform_user_id')
      .eq('discord_guild_id', discordGuildId);

    const linkedUserIds =
      linkedMembers?.map((member) => member.platform_user_id) || [];

    // Get workspace members who are not already linked to this Discord guild
    let membersQuery = supabase
      .from('workspace_members')
      .select(`
        user_id,
        role,
        role_title,
        created_at,
        users:user_id (
          id,
          display_name,
          avatar_url,
          handle
        )
      `)
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Exclude already linked members if any exist
    if (linkedUserIds.length > 0) {
      membersQuery = membersQuery.not(
        'user_id',
        'in',
        `(${linkedUserIds.join(',')})`
      );
    }

    // Add search filter if query is provided
    if (query.trim()) {
      membersQuery = membersQuery.or(
        `users.display_name.ilike.%${query}%,users.handle.ilike.%${query}%`
      );
    }

    const { data: availableMembers, error } = await membersQuery;

    if (error) {
      console.error('Error fetching available members:', error);
      return NextResponse.json(
        { message: 'Failed to fetch available members' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: availableMembers });
  } catch (error) {
    console.error('Error in available members GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
