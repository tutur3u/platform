import { canCreateInvitation } from '@tuturuuu/payment-core/seat-limits';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_EMAIL_LENGTH } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const InviteMemberSchema = z.object({
  accessPreset: z
    .enum(['member', 'guest', 'pos_operator'])
    .optional()
    .default('member'),
  confirmDefaultAdminMigration: z.boolean().optional().default(false),
  email: z.email().max(MAX_EMAIL_LENGTH),
  memberType: z.enum(['MEMBER', 'GUEST']).optional().default('MEMBER'),
});

type PosOperatorSetupResult = {
  adminRoleId: string | null;
  defaultAdminWasDisabled: boolean;
  memberCount: number;
  posOperatorRoleId: string;
  preservedMemberCount: number;
};

type PosOperatorSetupClient = {
  rpc: (
    functionName: 'create_inventory_pos_operator_invite',
    args: { p_actor_id: string; p_email: string; p_ws_id: string }
  ) => Promise<{
    data: PosOperatorSetupResult | null;
    error: { code?: string; message?: string } | null;
  }>;
};

const DUPLICATE_INVITE_MESSAGE =
  'User is already a member of this workspace or has a pending invite.';

function isUniqueViolation(error: { code?: string; message?: string }) {
  return (
    error.code === '23505' ||
    error.message?.toLowerCase().includes('duplicate key value') ||
    error.message?.toLowerCase().includes('unique constraint')
  );
}

// Helper to trigger immediate notification processing
async function triggerImmediateNotification() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn(
      'CRON_SECRET not configured, skipping immediate notification trigger'
    );
    return;
  }

  try {
    // Fire and forget - don't wait for response
    fetch(`${baseUrl}/api/notifications/send-immediate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({}),
    }).catch((error) => {
      console.error('Failed to trigger immediate notification', {
        error,
      });
    });
  } catch (error) {
    console.error('Error triggering immediate notification', { error });
  }
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId: requestedWsId } = await params;

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const permissions = await getPermissions({
    request: req,
    wsId: requestedWsId,
  });
  if (
    permissions?.membershipType !== 'MEMBER' ||
    permissions.withoutPermission('manage_workspace_members')
  ) {
    return NextResponse.json(
      { message: 'You do not have permission to invite workspace members.' },
      { status: 403 }
    );
  }

  const wsId = permissions.wsId;
  const sbAdmin = await createAdminClient();

  // Block invitations to personal workspaces
  const { data: wsData, error: workspaceError } = await sbAdmin
    .from('workspaces')
    .select('personal')
    .eq('id', wsId)
    .maybeSingle();

  if (workspaceError) {
    console.error('Failed to verify workspace before inviting member', {
      error: workspaceError,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error inviting workspace member.' },
      { status: 500 }
    );
  }

  if (wsData?.personal) {
    return NextResponse.json(
      { message: 'Cannot invite members to a personal workspace.' },
      { status: 403 }
    );
  }

  let payload: z.infer<typeof InviteMemberSchema>;

  try {
    const rawPayload = await req.json();
    payload = InviteMemberSchema.parse(rawPayload);
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body. Expected { email, memberType? }' },
      { status: 400 }
    );
  }

  const email = payload.email.trim().toLowerCase();
  const isPosOperatorInvite = payload.accessPreset === 'pos_operator';

  if (
    isPosOperatorInvite &&
    (permissions.withoutPermission('manage_workspace_roles') ||
      !payload.confirmDefaultAdminMigration)
  ) {
    return NextResponse.json(
      {
        message:
          'POS operator setup requires role management permission and explicit confirmation.',
      },
      { status: 403 }
    );
  }

  const { data: disableInvite, error: disableInviteError } = await sbAdmin
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', wsId)
    .eq('name', 'DISABLE_INVITE')
    .maybeSingle();

  if (disableInviteError) {
    console.error('Failed to verify workspace invite settings', {
      error: disableInviteError,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error inviting workspace member.' },
      { status: 500 }
    );
  }

  if (disableInvite) {
    return NextResponse.json(
      { message: 'Invitations are disabled for this workspace' },
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

  let posOperatorSetup: PosOperatorSetupResult | null = null;
  if (isPosOperatorInvite) {
    const privateAdmin = sbAdmin.schema(
      'private'
    ) as unknown as PosOperatorSetupClient;
    const { data, error } = await privateAdmin.rpc(
      'create_inventory_pos_operator_invite',
      {
        p_actor_id: user.id,
        p_email: email,
        p_ws_id: wsId,
      }
    );

    if (error || !data?.posOperatorRoleId) {
      if (error && isUniqueViolation(error)) {
        return NextResponse.json(
          { message: DUPLICATE_INVITE_MESSAGE },
          { status: 409 }
        );
      }

      console.error('Failed to prepare POS operator access', {
        error,
        wsId,
      });
      return NextResponse.json(
        {
          message:
            error?.message ?? 'Unable to prepare limited POS operator access.',
        },
        { status: 500 }
      );
    }

    posOperatorSetup = data;
  }

  const { error } = isPosOperatorInvite
    ? { error: null }
    : await sbAdmin.from('workspace_email_invites').insert({
        ws_id: wsId,
        email,
        invited_by: user.id,
        role_id: null,
        type: payload.accessPreset === 'guest' ? 'GUEST' : payload.memberType,
      });

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { message: DUPLICATE_INVITE_MESSAGE },
        { status: 409 }
      );
    }

    console.error('Failed to invite workspace member', {
      error,
      wsId,
    });
    return NextResponse.json(
      {
        message: 'Error inviting workspace member.',
      },
      { status: 500 }
    );
  }

  // Trigger immediate notification processing
  // The database trigger will create the notification batch with delivery_mode='immediate'
  // This call ensures it gets processed right away
  triggerImmediateNotification();

  return NextResponse.json({
    message: 'success',
    ...(posOperatorSetup ? { posOperatorSetup } : {}),
  });
}
