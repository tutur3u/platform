import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ConnectDiscordSchema = z.object({
  wsId: z.uuid(),
  discordGuildId: z.string().min(1),
});

const DisconnectDiscordSchema = z.object({
  wsId: z.uuid(),
  integrationId: z.uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { wsId, discordGuildId } = ConnectDiscordSchema.parse(body);

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

    // Check if Discord guild is already connected to another workspace
    const { data: existingIntegration } = await supabase
      .from('discord_integrations')
      .select('ws_id')
      .eq('discord_guild_id', discordGuildId)
      .maybeSingle();

    if (existingIntegration) {
      return NextResponse.json(
        { message: 'Discord server is already connected to another workspace' },
        { status: 409 }
      );
    }

    // Check if workspace already has a Discord integration
    const { data: workspaceIntegration } = await supabase
      .from('discord_integrations')
      .select('id')
      .eq('ws_id', wsId)
      .maybeSingle();

    if (workspaceIntegration) {
      return NextResponse.json(
        { message: 'Workspace already has a Discord integration' },
        { status: 409 }
      );
    }

    // Create the Discord integration
    const { data: integration, error } = await supabase
      .from('discord_integrations')
      .insert({
        discord_guild_id: discordGuildId,
        ws_id: wsId,
        creator_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating Discord integration:', error);
      return NextResponse.json(
        { message: 'Failed to create Discord integration' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Discord integration created successfully',
      integration,
    });
  } catch (error) {
    console.error('Discord integration error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.issues },
        { status: 400 }
      );
    }

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
    const { wsId, integrationId } = DisconnectDiscordSchema.parse(body);

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

    // Verify the integration belongs to the workspace
    const { data: integration } = await supabase
      .from('discord_integrations')
      .select('ws_id')
      .eq('id', integrationId)
      .eq('ws_id', wsId)
      .single();

    if (!integration) {
      return NextResponse.json(
        { message: 'Integration not found or access denied' },
        { status: 404 }
      );
    }

    // Delete the Discord integration (this will cascade delete guild members)
    const { error } = await supabase
      .from('discord_integrations')
      .delete()
      .eq('id', integrationId);

    if (error) {
      console.error('Error deleting Discord integration:', error);
      return NextResponse.json(
        { message: 'Failed to delete Discord integration' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Discord integration deleted successfully',
    });
  } catch (error) {
    console.error('Discord integration deletion error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
