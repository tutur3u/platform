import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    linkId: string;
  }>;
}

const UpdateInviteLinkSchema = z.object({
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

// GET - Get invite link details including users who joined via this link
export async function GET(_: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { wsId, linkId } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a member of the workspace
    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    // Fetch invite link with stats
    const { data: inviteLink, error: linkError } = await supabase
      .from('workspace_invite_links_with_stats')
      .select('*')
      .eq('id', linkId)
      .eq('ws_id', wsId)
      .single();

    if (linkError || !inviteLink) {
      return NextResponse.json(
        { error: 'Invite link not found' },
        { status: 404 }
      );
    }

    // Fetch users who joined via this link
    const { data: uses, error: usesError } = await supabase
      .from('workspace_invite_link_uses')
      .select(
        `
        id,
        user_id,
        joined_at,
        users:user_id (
          id,
          display_name,
          avatar_url,
          handle
        )
      `
      )
      .eq('invite_link_id', linkId)
      .order('joined_at', { ascending: false });

    if (usesError) {
      console.error('Failed to fetch invite link uses:', usesError);
    }

    return NextResponse.json(
      {
        ...inviteLink,
        uses: uses || [],
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

// PATCH - Update invite link settings (max_uses, expires_at)
export async function PATCH(req: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();
    const { wsId, linkId } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a member of the workspace
    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    // Verify the invite link exists and belongs to this workspace
    const { data: existingLink, error: fetchError } = await supabase
      .from('workspace_invite_links')
      .select('id, ws_id')
      .eq('id', linkId)
      .eq('ws_id', wsId)
      .single();

    if (fetchError || !existingLink) {
      return NextResponse.json(
        { error: 'Invite link not found' },
        { status: 404 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = UpdateInviteLinkSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { maxUses, expiresAt } = validation.data;

    // Update the invite link
    const { data: updatedLink, error: updateError } = await sbAdmin
      .from('workspace_invite_links')
      .update({
        max_uses: maxUses,
        expires_at: expiresAt,
      })
      .eq('id', linkId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update invite link:', updateError);
      return NextResponse.json(
        { error: 'Failed to update invite link' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedLink, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete/revoke an invite link
export async function DELETE(_: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();
    const { wsId, linkId } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a member of the workspace
    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    // Verify the invite link exists and belongs to this workspace
    const { data: existingLink, error: fetchError } = await supabase
      .from('workspace_invite_links')
      .select('id, ws_id')
      .eq('id', linkId)
      .eq('ws_id', wsId)
      .single();

    if (fetchError || !existingLink) {
      return NextResponse.json(
        { error: 'Invite link not found' },
        { status: 404 }
      );
    }

    // Delete the invite link
    const { error: deleteError } = await sbAdmin
      .from('workspace_invite_links')
      .delete()
      .eq('id', linkId);

    if (deleteError) {
      console.error('Failed to delete invite link:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete invite link' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Invite link deleted' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
