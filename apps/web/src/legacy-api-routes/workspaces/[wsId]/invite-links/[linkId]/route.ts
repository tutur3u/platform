import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { normalizeInviteLinkDetails } from '@/lib/workspace-invite-links';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
    linkId: string;
  }>;
}

const UpdateInviteLinkSchema = z.object({
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  memberType: z.enum(['MEMBER', 'GUEST']).optional(),
});

// GET - Get invite link details including users who joined via this link
export async function GET(req: Request, { params }: Params) {
  try {
    const { wsId, linkId } = await params;
    const access = await resolveWorkspaceRouteAccess(req, wsId);
    if (!access.ok) return access.response;
    const sbAdmin = await createAdminClient({ noCookie: true });
    const resolvedWsId = access.permissions.wsId;

    // Fetch invite link with stats
    const { data: inviteLink, error: linkError } = await sbAdmin
      .from('workspace_invite_links_with_stats')
      .select('*')
      .eq('id', linkId)
      .eq('ws_id', resolvedWsId)
      .single();

    if (linkError || !inviteLink) {
      return NextResponse.json(
        { error: 'Invite link not found' },
        { status: 404 }
      );
    }

    // Fetch users who joined via this link
    const { data: uses, error: usesError } = await sbAdmin
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
      normalizeInviteLinkDetails({
        ...inviteLink,
        uses: uses || [],
      }),
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
    const { wsId, linkId } = await params;
    const access = await resolveWorkspaceRouteAccess(req, wsId, [
      'manage_workspace_members',
    ]);
    if (!access.ok) return access.response;
    if (access.permissions.membershipType !== 'MEMBER') {
      return NextResponse.json(
        { error: 'You do not have permission to manage invite links' },
        { status: 403 }
      );
    }
    const sbAdmin = await createAdminClient({ noCookie: true });
    const resolvedWsId = access.permissions.wsId;

    // Verify the invite link exists and belongs to this workspace
    const { data: existingLink, error: fetchError } = await sbAdmin
      .from('workspace_invite_links')
      .select('id, ws_id')
      .eq('id', linkId)
      .eq('ws_id', resolvedWsId)
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
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { maxUses, expiresAt, memberType } = validation.data;

    const { data: updatedLink, error: updateError } = await sbAdmin
      .from('workspace_invite_links')
      .update({
        max_uses: maxUses,
        expires_at: expiresAt,
        ...(memberType !== undefined ? { type: memberType } : {}),
      })
      .eq('id', linkId)
      .eq('ws_id', resolvedWsId)
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
export async function DELETE(req: Request, { params }: Params) {
  try {
    const { wsId, linkId } = await params;
    const access = await resolveWorkspaceRouteAccess(req, wsId, [
      'manage_workspace_members',
    ]);
    if (!access.ok) return access.response;
    if (access.permissions.membershipType !== 'MEMBER') {
      return NextResponse.json(
        { error: 'You do not have permission to manage invite links' },
        { status: 403 }
      );
    }
    const sbAdmin = await createAdminClient({ noCookie: true });
    const resolvedWsId = access.permissions.wsId;

    // Verify the invite link exists and belongs to this workspace
    const { data: existingLink, error: fetchError } = await sbAdmin
      .from('workspace_invite_links')
      .select('id, ws_id')
      .eq('id', linkId)
      .eq('ws_id', resolvedWsId)
      .single();

    if (fetchError || !existingLink) {
      return NextResponse.json(
        { error: 'Invite link not found' },
        { status: 404 }
      );
    }

    const { error: deleteError } = await sbAdmin
      .from('workspace_invite_links')
      .delete()
      .eq('id', linkId)
      .eq('ws_id', resolvedWsId);

    if (deleteError) {
      console.error('Failed to delete invite link:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete invite link' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Invite link deleted' },
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
