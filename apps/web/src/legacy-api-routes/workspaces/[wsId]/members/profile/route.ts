import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type WorkspaceProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type WorkspaceProfileResponse = {
  id: string;
  display_name: string | null;
};

const updateWorkspaceMemberProfileSchema = z
  .object({
    displayName: z.string().max(MAX_NAME_LENGTH).nullable(),
    email: z.email().nullable().optional(),
    userId: z.uuid().nullable().optional(),
  })
  .refine((data) => data.userId || data.email, {
    message: 'Either userId or email is required',
    path: ['userId'],
  });

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || null;
}

function normalizeDisplayName(displayName: string | null) {
  const trimmed = displayName?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function serializeWorkspaceProfile(
  profile: WorkspaceProfileResponse
): WorkspaceProfileResponse {
  return {
    display_name: profile.display_name,
    id: profile.id,
  };
}

async function findSingleProfileByEmail({
  email,
  sbAdmin,
  wsId,
}: {
  email: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}): Promise<
  | { status: 'found'; profile: WorkspaceProfile }
  | { status: 'not_found' }
  | { status: 'ambiguous' }
> {
  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('id, display_name, email')
    .eq('ws_id', wsId)
    .ilike('email', email)
    .limit(3);

  if (error) {
    throw error;
  }

  const matches = (data ?? []).filter(
    (profile) => normalizeEmail(profile.email) === email
  );

  if (matches.length > 1) {
    return { status: 'ambiguous' };
  }

  if (matches.length === 1 && matches[0]) {
    return { status: 'found', profile: matches[0] };
  }

  return { status: 'not_found' };
}

async function verifyUserTarget({
  sbAdmin,
  userId,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  const [memberResult, inviteResult, detailsResult] = await Promise.all([
    sbAdmin
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .maybeSingle(),
    sbAdmin
      .from('workspace_invites')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .maybeSingle(),
    sbAdmin
      .from('user_private_details')
      .select('email')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (memberResult.error) throw memberResult.error;
  if (inviteResult.error) throw inviteResult.error;
  if (detailsResult.error) throw detailsResult.error;

  if (!memberResult.data && !inviteResult.data) {
    return null;
  }

  return {
    email: normalizeEmail(detailsResult.data?.email),
  };
}

async function findLinkedProfile({
  sbAdmin,
  userId,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .from('workspace_user_linked_users')
    .select(
      'virtual_user_id, workspace_users!virtual_user_id(id, display_name, email)'
    )
    .eq('platform_user_id', userId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;

  const profile = data?.workspace_users;
  if (!profile || Array.isArray(profile)) {
    return null;
  }

  return profile as WorkspaceProfile;
}

async function createProfile({
  displayName,
  email,
  sbAdmin,
  wsId,
}: {
  displayName: string | null;
  email: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .from('workspace_users')
    .insert({
      display_name: displayName,
      email,
      ws_id: wsId,
    })
    .select('id, display_name, email')
    .single();

  if (error) throw error;
  return data;
}

async function updateProfileDisplayName({
  displayName,
  profileId,
  sbAdmin,
  wsId,
}: {
  displayName: string | null;
  profileId: string;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .from('workspace_users')
    .update({ display_name: displayName })
    .eq('id', profileId)
    .eq('ws_id', wsId)
    .select('id, display_name')
    .single();

  if (error) throw error;
  return data;
}

async function linkProfileToUser({
  profileId,
  sbAdmin,
  userId,
  wsId,
}: {
  profileId: string;
  sbAdmin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  const { error } = await sbAdmin.from('workspace_user_linked_users').upsert(
    {
      platform_user_id: userId,
      virtual_user_id: profileId,
      ws_id: wsId,
    },
    {
      onConflict: 'platform_user_id,ws_id',
    }
  );

  if (error) throw error;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await resolveWorkspaceRouteAccess(request, rawWsId, [
    'manage_workspace_members',
  ]);

  if (!access.ok) {
    return access.response;
  }

  const wsId = access.permissions.wsId;
  const payload = updateWorkspaceMemberProfileSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!payload.success) {
    return NextResponse.json(
      {
        errors: payload.error.issues,
        message: 'Invalid request body',
      },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const displayName = normalizeDisplayName(payload.data.displayName);
  const email = normalizeEmail(payload.data.email);
  const userId = payload.data.userId ?? null;

  try {
    let profile: WorkspaceProfile | null = null;

    if (userId) {
      const userTarget = await verifyUserTarget({ sbAdmin, userId, wsId });

      if (!userTarget) {
        return NextResponse.json(
          { message: 'Workspace member or invite not found' },
          { status: 404 }
        );
      }

      profile = await findLinkedProfile({ sbAdmin, userId, wsId });

      if (!profile) {
        const targetEmail = userTarget.email ?? email;

        if (!targetEmail) {
          return NextResponse.json(
            {
              message:
                'Workspace member email is required before creating a profile',
            },
            { status: 400 }
          );
        }

        const match = await findSingleProfileByEmail({
          email: targetEmail,
          sbAdmin,
          wsId,
        });

        if (match.status === 'ambiguous') {
          return NextResponse.json(
            { message: 'Multiple workspace profiles match this member email' },
            { status: 409 }
          );
        }

        profile =
          match.status === 'found'
            ? match.profile
            : await createProfile({
                displayName,
                email: targetEmail,
                sbAdmin,
                wsId,
              });

        await linkProfileToUser({
          profileId: profile.id,
          sbAdmin,
          userId,
          wsId,
        });
      }
    } else if (email) {
      const { data: invite, error: inviteError } = await sbAdmin
        .from('workspace_email_invites')
        .select('email')
        .eq('ws_id', wsId)
        .ilike('email', email)
        .maybeSingle();

      if (inviteError) throw inviteError;

      if (normalizeEmail(invite?.email) !== email) {
        return NextResponse.json(
          { message: 'Workspace email invite not found' },
          { status: 404 }
        );
      }

      const match = await findSingleProfileByEmail({ email, sbAdmin, wsId });

      if (match.status === 'ambiguous') {
        return NextResponse.json(
          { message: 'Multiple workspace profiles match this invite email' },
          { status: 409 }
        );
      }

      profile =
        match.status === 'found'
          ? match.profile
          : await createProfile({
              displayName,
              email,
              sbAdmin,
              wsId,
            });
    }

    if (!profile) {
      return NextResponse.json(
        { message: 'Workspace member or invite not found' },
        { status: 404 }
      );
    }

    const updatedProfile = await updateProfileDisplayName({
      displayName,
      profileId: profile.id,
      sbAdmin,
      wsId,
    });

    return NextResponse.json({
      message: 'success',
      workspaceUser: serializeWorkspaceProfile(updatedProfile),
    });
  } catch (error) {
    console.error('Error updating workspace member profile:', error);
    return NextResponse.json(
      { message: 'Error updating workspace member profile' },
      { status: 500 }
    );
  }
}
