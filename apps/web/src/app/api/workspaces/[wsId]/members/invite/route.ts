import { canCreateInvitation } from '@tuturuuu/payment-core/seat-limits';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_EMAIL_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

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
  roleIds: z.array(z.uuid()).max(50).optional().default([]),
  roleId: z.uuid().nullable().optional(),
});

const UpdateInvitationRoleSchema = z
  .object({
    email: z.email().max(MAX_EMAIL_LENGTH).nullable().optional(),
    roleIds: z.array(z.uuid()).max(50).optional(),
    roleId: z.uuid().nullable().optional(),
    userId: z.uuid().nullable().optional(),
  })
  .refine(
    ({ email, userId }) => Boolean(email) !== Boolean(userId),
    'Expected exactly one invitation identifier.'
  )
  .refine(
    ({ roleId, roleIds }) => roleId !== undefined || roleIds !== undefined,
    'Expected invitation roles.'
  );

function normalizeRequestedRoleIds({
  roleId,
  roleIds,
}: {
  roleId?: null | string;
  roleIds?: string[];
}) {
  return [...new Set([...(roleIds ?? []), ...(roleId ? [roleId] : [])])];
}

type InvitationRoleListRow = {
  email: null | string;
  role_ids: string[];
  user_id: null | string;
};

type InvitationRoleRpcClient = {
  rpc: (
    functionName: 'list_workspace_invitation_role_ids',
    args: { p_ws_id: string }
  ) => Promise<{
    data: InvitationRoleListRow[] | null;
    error: { code?: string; message?: string } | null;
  }>;
};

type SetInvitationRolesRpcClient = {
  rpc: (
    functionName: 'set_workspace_invitation_roles',
    args: {
      p_email: null | string;
      p_role_ids: string[];
      p_user_id: null | string;
      p_ws_id: string;
    }
  ) => Promise<{
    data: null;
    error: { code?: string; message?: string } | null;
  }>;
};

type CreateEmailInvitationRpcClient = {
  rpc: (
    functionName: 'create_workspace_email_invitation_with_roles',
    args: {
      p_email: string;
      p_invited_by: string;
      p_member_type: 'GUEST' | 'MEMBER';
      p_role_ids: string[];
      p_ws_id: string;
    }
  ) => Promise<{
    data: null;
    error: { code?: string; message?: string } | null;
  }>;
};

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

export async function GET(req: Request, { params }: Params) {
  const { wsId: requestedWsId } = await params;
  const access = await resolveWorkspaceRouteAccess(req, requestedWsId, [
    'manage_workspace_members',
    'manage_workspace_roles',
  ]);
  if (!access.ok) return access.response;

  const wsId = access.permissions.wsId;
  const sbAdmin = await createAdminClient({ noCookie: true });
  const privateDb = sbAdmin.schema(
    'private'
  ) as unknown as InvitationRoleRpcClient;
  const invitationsResult = await privateDb.rpc(
    'list_workspace_invitation_role_ids',
    { p_ws_id: wsId }
  );

  if (invitationsResult.error) {
    console.error('Failed to list workspace invitation roles', {
      error: invitationsResult.error,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error fetching workspace invitation roles.' },
      { status: 500 }
    );
  }

  const roleIds = [
    ...new Set(
      (invitationsResult.data ?? []).flatMap(
        (invitation) => invitation.role_ids
      )
    ),
  ];
  const roleById = new Map<string, { id: string; name: string }>();

  if (roleIds.length > 0) {
    const { data: roles, error: rolesError } = await sbAdmin
      .from('workspace_roles')
      .select('id, name')
      .eq('ws_id', wsId)
      .in('id', roleIds);

    if (rolesError) {
      console.error('Failed to resolve workspace invitation roles', {
        error: rolesError,
        wsId,
      });
      return NextResponse.json(
        { message: 'Error fetching workspace invitation roles.' },
        { status: 500 }
      );
    }

    for (const role of roles ?? []) roleById.set(role.id, role);
  }

  return NextResponse.json([
    ...(invitationsResult.data ?? []).map((invitation) => ({
      email: invitation.email,
      roles: invitation.role_ids.flatMap((roleId) => {
        const role = roleById.get(roleId);
        return role ? [role] : [];
      }),
      userId: invitation.user_id,
    })),
  ]);
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId: requestedWsId } = await params;
  const access = await resolveWorkspaceRouteAccess(req, requestedWsId);
  if (!access.ok) return access.response;

  if (
    access.permissions.membershipType !== 'MEMBER' ||
    access.permissions.withoutPermission('manage_workspace_roles')
  ) {
    return NextResponse.json(
      {
        message:
          'You do not have permission to assign workspace roles to invitations.',
      },
      { status: 403 }
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid invitation role update.' },
      { status: 400 }
    );
  }
  const parsed = UpdateInvitationRoleSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid invitation role update.' },
      { status: 400 }
    );
  }

  const wsId = access.permissions.wsId;
  const sbAdmin = await createAdminClient({ noCookie: true });
  const userId = parsed.data.userId ?? null;
  const email = parsed.data.email?.trim().toLowerCase() ?? null;
  const roleIds = normalizeRequestedRoleIds(parsed.data);
  const inviteResult = userId
    ? await sbAdmin
        .from('workspace_invites')
        .select('type')
        .eq('ws_id', wsId)
        .eq('user_id', userId)
        .maybeSingle()
    : await sbAdmin
        .from('workspace_email_invites')
        .select('type')
        .eq('ws_id', wsId)
        .eq('email', email as string)
        .maybeSingle();

  if (inviteResult.error) {
    console.error('Failed to find workspace invitation for role update', {
      error: inviteResult.error,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error updating workspace invitation role.' },
      { status: 500 }
    );
  }

  if (!inviteResult.data) {
    return NextResponse.json(
      { message: 'Pending workspace invitation not found.' },
      { status: 404 }
    );
  }

  if (inviteResult.data.type !== 'MEMBER' && roleIds.length > 0) {
    return NextResponse.json(
      {
        message: 'Workspace roles can only be assigned to member invitations.',
      },
      { status: 400 }
    );
  }

  if (roleIds.length > 0) {
    const { data: matchingRoles, error: roleError } = await sbAdmin
      .from('workspace_roles')
      .select('id')
      .eq('ws_id', wsId)
      .in('id', roleIds);

    if (roleError || matchingRoles?.length !== roleIds.length) {
      return NextResponse.json(
        {
          message: roleError
            ? 'Error validating workspace invitation role.'
            : 'One or more selected workspace roles are not available.',
        },
        { status: roleError ? 500 : 400 }
      );
    }
  }

  const privateDb = sbAdmin.schema(
    'private'
  ) as unknown as SetInvitationRolesRpcClient;
  const updateResult = await privateDb.rpc('set_workspace_invitation_roles', {
    p_email: email,
    p_role_ids: roleIds,
    p_user_id: userId,
    p_ws_id: wsId,
  });

  if (updateResult.error) {
    console.error('Failed to update workspace invitation role', {
      error: updateResult.error,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error updating workspace invitation role.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
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
  const { wsId: requestedWsId } = await params;

  // Satellite apps (inventory, contacts, finance, …) proxy this route to web
  // with an app-session token instead of a Supabase auth cookie, so actor
  // resolution has to go through the app-session-aware helper. Reading Supabase
  // auth directly here made every satellite invite fail with "Unauthorized".
  const access = await resolveWorkspaceRouteAccess(req, requestedWsId);
  if (!access.ok) return access.response;

  const { permissions, user } = access;

  if (
    permissions.membershipType !== 'MEMBER' ||
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
  const roleIds = normalizeRequestedRoleIds(payload);
  const isPosOperatorInvite = payload.accessPreset === 'pos_operator';
  const isGuestInvite =
    payload.accessPreset === 'guest' || payload.memberType === 'GUEST';

  if (isPosOperatorInvite && roleIds.length > 0) {
    return NextResponse.json(
      { message: 'POS operator invitations manage their role automatically.' },
      { status: 400 }
    );
  }

  if (isGuestInvite && roleIds.length > 0) {
    return NextResponse.json(
      {
        message: 'Workspace roles can only be assigned to member invitations.',
      },
      { status: 400 }
    );
  }

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

  if (
    roleIds.length > 0 &&
    permissions.withoutPermission('manage_workspace_roles')
  ) {
    return NextResponse.json(
      {
        message:
          'You do not have permission to assign workspace roles to invitations.',
      },
      { status: 403 }
    );
  }

  if (roleIds.length > 0) {
    const { data: matchingRoles, error: roleError } = await sbAdmin
      .from('workspace_roles')
      .select('id')
      .eq('ws_id', wsId)
      .in('id', roleIds);

    if (roleError) {
      console.error('Failed to validate workspace invitation role', {
        error: roleError,
        wsId,
      });
      return NextResponse.json(
        { message: 'Error validating workspace invitation role.' },
        { status: 500 }
      );
    }

    if (matchingRoles?.length !== roleIds.length) {
      return NextResponse.json(
        { message: 'One or more selected workspace roles are not available.' },
        { status: 400 }
      );
    }
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

  const invitationDb = sbAdmin.schema(
    'private'
  ) as unknown as CreateEmailInvitationRpcClient;
  const { error } = isPosOperatorInvite
    ? { error: null }
    : await invitationDb.rpc('create_workspace_email_invitation_with_roles', {
        p_email: email,
        p_invited_by: user.id,
        p_member_type:
          payload.accessPreset === 'guest' ? 'GUEST' : payload.memberType,
        p_role_ids: roleIds,
        p_ws_id: wsId,
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
