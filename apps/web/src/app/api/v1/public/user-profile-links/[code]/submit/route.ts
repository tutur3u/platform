import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildSanitizedPayload,
  findDisallowedFields,
  getLinkUnavailableReason,
} from '@/features/user-profile-links/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{ code: string }>;
}

const bodySchema = z.object({
  fields: z.record(z.string(), z.union([z.string(), z.null()])),
});

export async function POST(req: Request, { params }: Params) {
  const { code } = await params;

  // 1. Require login (attribution + security).
  const supabase = await createClient(req);
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();

  // 2. Resolve and re-validate the link (never trust the client).
  const { data: link } = await sbAdmin
    .from('workspace_user_profile_links_with_stats')
    .select(
      'id, ws_id, mode, target_user_id, allowed_fields, is_expired, is_full, is_revoked'
    )
    .eq('code', code)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ message: 'Link not found' }, { status: 404 });
  }

  const unavailable = getLinkUnavailableReason(link);
  if (unavailable) {
    return NextResponse.json(
      { message: 'Link is no longer available', reason: unavailable },
      { status: 410 }
    );
  }

  // View columns are typed nullable; capture the required identifiers.
  const linkId = link.id;
  const linkWsId = link.ws_id;
  const linkMode = link.mode;
  if (!linkId || !linkWsId || !linkMode) {
    return NextResponse.json(
      { message: 'Link is misconfigured' },
      { status: 500 }
    );
  }

  const allowedFields = link.allowed_fields ?? [];

  // 3. Reject any field outside the link's allowlist.
  const disallowed = findDisallowedFields(
    Object.keys(parsed.data.fields),
    allowedFields
  );
  if (disallowed.length > 0) {
    return NextResponse.json(
      { message: 'Submitted fields not permitted', fields: disallowed },
      { status: 400 }
    );
  }

  const { payload, submittedFields } = buildSanitizedPayload(
    allowedFields,
    parsed.data.fields,
    { actorEmail: user.email }
  );

  if (submittedFields.length === 0) {
    return NextResponse.json({ message: 'Nothing to submit' }, { status: 400 });
  }

  // 4. Write to the workspace_user via the audit-actor RPC (audit is automatic).
  let workspaceUserId: string | null = null;

  if (linkMode === 'per_user') {
    const targetUserId = link.target_user_id;
    if (!targetUserId) {
      return NextResponse.json(
        { message: 'Link is misconfigured' },
        { status: 500 }
      );
    }
    const { data: updated, error } = await sbAdmin.rpc(
      'admin_update_workspace_user_with_audit_actor',
      {
        p_ws_id: linkWsId,
        p_user_id: targetUserId,
        p_payload: payload,
        p_actor_auth_uid: user.id,
      }
    );
    if (error || !updated) {
      serverLogger.error('Error completing per_user profile link:', error);
      return NextResponse.json(
        { message: 'Error saving profile' },
        { status: 500 }
      );
    }
    workspaceUserId = updated.id;
  } else {
    // Generic mode: reuse this actor's previously-created row if any
    // ("created or updated"), otherwise create a fresh workspace_user.
    const { data: existing } = await sbAdmin
      .from('workspace_user_profile_link_submissions')
      .select('workspace_user_id')
      .eq('profile_link_id', linkId)
      .eq('actor_auth_uid', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.workspace_user_id) {
      const { data: updated, error } = await sbAdmin.rpc(
        'admin_update_workspace_user_with_audit_actor',
        {
          p_ws_id: linkWsId,
          p_user_id: existing.workspace_user_id,
          p_payload: payload,
          p_actor_auth_uid: user.id,
        }
      );
      if (error || !updated) {
        serverLogger.error('Error updating generic profile link row:', error);
        return NextResponse.json(
          { message: 'Error saving profile' },
          { status: 500 }
        );
      }
      workspaceUserId = updated.id;
    } else {
      const { data: created, error } = await sbAdmin.rpc(
        'admin_create_workspace_user_with_audit_actor',
        {
          p_ws_id: linkWsId,
          p_payload: payload,
          p_actor_auth_uid: user.id,
        }
      );
      if (error || !created) {
        serverLogger.error('Error creating generic profile link row:', error);
        return NextResponse.json(
          { message: 'Error saving profile' },
          { status: 500 }
        );
      }
      workspaceUserId = created.id;
    }
  }

  if (!workspaceUserId) {
    return NextResponse.json(
      { message: 'Error saving profile' },
      { status: 500 }
    );
  }

  // 5. Record the submission (feature-specific provenance trail).
  const { error: submissionError } = await sbAdmin
    .from('workspace_user_profile_link_submissions')
    .insert({
      profile_link_id: linkId,
      ws_id: linkWsId,
      workspace_user_id: workspaceUserId,
      actor_auth_uid: user.id,
      submitted_fields: submittedFields,
    });

  if (submissionError) {
    // The profile write already succeeded and was audited; don't fail the
    // request just because the supplementary submission log failed.
    serverLogger.error(
      'Error recording profile link submission:',
      submissionError
    );
  }

  return NextResponse.json({ message: 'success' });
}
