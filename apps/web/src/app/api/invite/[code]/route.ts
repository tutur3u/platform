import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    code: string;
  }>;
}

// GET - Validate invite code and return workspace information
export async function GET(_: Request, { params }: Params) {
  try {
    const sbAdmin = await createAdminClient();
    const { code } = await params;

    if (!code) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      );
    }

    // Fetch invite link with stats
    const { data: inviteLink, error } = await sbAdmin
      .from('workspace_invite_links_with_stats')
      .select(
        `
        *,
        workspaces:ws_id (
          id,
          name,
          avatar_url,
          logo_url
        )
      `
      )
      .eq('code', code)
      .single();

    if (error || !inviteLink) {
      return NextResponse.json(
        { error: 'Invalid or expired invite code' },
        { status: 404 }
      );
    }

    // Check if the link is expired
    if (inviteLink.is_expired) {
      return NextResponse.json(
        { error: 'This invite link has expired' },
        { status: 410 }
      );
    }

    // Check if the link has reached max uses
    if (inviteLink.is_full) {
      return NextResponse.json(
        { error: 'This invite link has reached its maximum usage limit' },
        { status: 410 }
      );
    }

    if (!inviteLink.ws_id) {
      return NextResponse.json(
        { error: 'Invite link is not associated with a valid workspace' },
        { status: 500 }
      );
    }

    // Get member count for the workspace
    const { count: memberCount } = await sbAdmin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', inviteLink.ws_id as string);

    return NextResponse.json(
      {
        workspace: inviteLink.workspaces,
        role: inviteLink.role,
        roleTitle: inviteLink.role_title,
        memberCount: memberCount || 0,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Join workspace using invite code
export async function POST(_: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();
    const { code } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: 'You must be signed in to join a workspace' },
        { status: 401 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      );
    }

    // Fetch invite link with current usage stats
    const { data: inviteLink, error: fetchError } = await sbAdmin
      .from('workspace_invite_links_with_stats')
      .select('*')
      .eq('code', code)
      .single();

    if (fetchError || !inviteLink) {
      return NextResponse.json(
        { error: 'Invalid or expired invite code' },
        { status: 404 }
      );
    }

    // Check if the link is expired (safe to check before insert)
    if (inviteLink.is_expired) {
      return NextResponse.json(
        { error: 'This invite link has expired' },
        { status: 410 }
      );
    }

    if (!inviteLink.ws_id) {
      return NextResponse.json(
        { error: 'Invite link is not associated with a valid workspace' },
        { status: 500 }
      );
    }

    // Add user to workspace first - this will fail if they're already a member (unique constraint)
    // ws_id is already validated above to exist
    const wsId = inviteLink.ws_id as string;
    const { error: memberError } = await sbAdmin
      .from('workspace_members')
      .insert({
        ws_id: wsId,
        user_id: user.id,
        role: inviteLink.role ?? undefined,
        role_title: inviteLink.role_title ?? undefined,
      });

    if (memberError) {
      // Check if it's a duplicate key violation (user already a member)
      if (memberError.code === '23505') {
        return NextResponse.json(
          { error: 'You are already a member of this workspace' },
          { status: 409 }
        );
      }

      console.error('Failed to add member to workspace:', memberError);
      return NextResponse.json(
        { error: 'Failed to join workspace' },
        { status: 500 }
      );
    }

    // After successful insert, verify the link hasn't exceeded max_uses
    // This prevents race conditions where multiple users join simultaneously
    const { data: updatedLink } = await sbAdmin
      .from('workspace_invite_links_with_stats')
      .select('current_uses, max_uses, is_full')
      .eq('id', inviteLink.id ?? '')
      .single();

    // If the link is now full and we exceeded the limit, rollback by removing the member
    if (
      updatedLink &&
      inviteLink.max_uses &&
      updatedLink.current_uses !== null &&
      updatedLink.current_uses > inviteLink.max_uses
    ) {
      // Rollback: remove the member we just added
      await sbAdmin
        .from('workspace_members')
        .delete()
        .eq('ws_id', inviteLink.ws_id as string)
        .eq('user_id', user.id);

      return NextResponse.json(
        { error: 'This invite link has reached its maximum usage limit' },
        { status: 410 }
      );
    }

    // Record the invite link usage (ws_id is already validated above to exist)
    const { error: usageError } = await sbAdmin
      .from('workspace_invite_link_uses')
      .insert({
        invite_link_id: inviteLink.id ?? '',
        user_id: user.id,
        ws_id: inviteLink.ws_id as string,
      });

    if (usageError) {
      console.error('Failed to record invite link usage:', usageError);
      // Don't fail the request if we can't record usage - user is already added
    }

    // Fetch workspace details to return
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, avatar_url')
      .eq('id', inviteLink.ws_id as string)
      .single();

    return NextResponse.json(
      {
        message: 'Successfully joined workspace',
        workspace,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
