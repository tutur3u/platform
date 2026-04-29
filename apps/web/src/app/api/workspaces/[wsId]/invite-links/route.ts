import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { canCreateInvitation } from '@/utils/seat-limits';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const CreateInviteLinkSchema = z.object({
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.iso.datetime().optional().nullable(),
  memberType: z.enum(['MEMBER', 'GUEST']).optional(),
});

// POST - Create a new invite link
export async function POST(req: Request, { params }: Params) {
  try {
    const supabase = await createClient(req);
    const { wsId } = await params;

    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a member of the workspace
    const member = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (member.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!member.ok) {
      return NextResponse.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    // Block invite link creation for personal workspaces
    const sbAdmin = await createAdminClient();

    const { data: wsData } = await sbAdmin
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .single();

    if (wsData?.personal) {
      return NextResponse.json(
        { error: 'Cannot create invite links for a personal workspace.' },
        { status: 403 }
      );
    }

    // Check if DISABLE_INVITE secret is set
    const { data: disableInvite } = await sbAdmin
      .from('workspace_secrets')
      .select('value')
      .eq('ws_id', wsId)
      .eq('name', 'DISABLE_INVITE')
      .single();

    if (disableInvite) {
      return NextResponse.json(
        { error: 'Invitations are disabled for this workspace' },
        { status: 403 }
      );
    }

    // Check if seat limit allows creating invitations
    const inviteCheck = await canCreateInvitation(sbAdmin, wsId);
    if (!inviteCheck.allowed) {
      return NextResponse.json(
        {
          errorCode: 'SEAT_LIMIT_REACHED',
          message: inviteCheck.message,
          seatStatus: inviteCheck.status,
        },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = CreateInviteLinkSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { maxUses, expiresAt, memberType } = validation.data;
    const linkMemberType = memberType ?? 'MEMBER';

    // Use insert-retry strategy to handle unique code generation
    const maxAttempts = 10;
    let inviteLink = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = nanoid(10);

      // Attempt to insert with the generated code
      const { data, error: insertError } = await sbAdmin
        .from('workspace_invite_links')
        .insert({
          ws_id: wsId,
          code,
          creator_id: user.id,
          max_uses: maxUses,
          expires_at: expiresAt,
          type: linkMemberType,
        })
        .select()
        .single();

      // Check for unique violation error (PostgreSQL error code 23505)
      if (insertError) {
        // If it's a unique violation, retry with a new code
        if (insertError.code === '23505') {
          continue;
        }

        // For any other error, return immediately
        console.error('Failed to create invite link:', insertError);
        return NextResponse.json(
          { error: 'Failed to create invite link' },
          { status: 500 }
        );
      }

      // Success - insert completed
      inviteLink = data;
      break;
    }

    // If we exhausted all retries
    if (!inviteLink) {
      return NextResponse.json(
        { error: 'Failed to generate unique code. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(inviteLink, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - List all invite links for the workspace
export async function GET(req: Request, { params }: Params) {
  try {
    const supabase = await createClient(req);
    const { wsId } = await params;

    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const member = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (member.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!member.ok) {
      return NextResponse.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    // Fetch invite links with stats
    const { data: inviteLinks, error } = await supabase
      .from('workspace_invite_links_with_stats')
      .select('*')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch invite links:', error);
      return NextResponse.json(
        { error: 'Failed to fetch invite links' },
        { status: 500 }
      );
    }

    return NextResponse.json(inviteLinks || [], { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
