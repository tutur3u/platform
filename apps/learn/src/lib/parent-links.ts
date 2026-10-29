import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Tables } from '@tuturuuu/types/supabase';

type TypedSupabaseClient = Awaited<ReturnType<typeof createAdminClient>>;

export type ParentLinkRow = Tables<'tulearn_parent_student_links'>;

export const PG_UNIQUE_VIOLATION = '23505';

interface ParentLinkKey {
  parentUserId: string;
  studentWorkspaceUserId: string;
  wsId: string;
}

/**
 * Parent consent: a link only grants a parent access once it is `active`, and
 * only the parent themself (or a verified invite for their email) can make it
 * active. Admins create `pending` links; they never write `active` directly.
 */
export async function findOpenParentLinks(
  sbAdmin: TypedSupabaseClient,
  { parentUserId, studentWorkspaceUserId, wsId }: ParentLinkKey
) {
  const { data, error } = await sbAdmin
    .from('tulearn_parent_student_links')
    .select('*')
    .eq('ws_id', wsId)
    .eq('parent_user_id', parentUserId)
    .eq('student_workspace_user_id', studentWorkspaceUserId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as ParentLinkRow[];
  return {
    active: rows.find((row) => row.status === 'active') ?? null,
    pending: rows.find((row) => row.status === 'pending') ?? null,
  };
}

export async function getBoundStudentPlatformUserId(
  sbAdmin: TypedSupabaseClient,
  { studentWorkspaceUserId, wsId }: Omit<ParentLinkKey, 'parentUserId'>
) {
  const { data, error } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('platform_user_id')
    .eq('ws_id', wsId)
    .eq('virtual_user_id', studentWorkspaceUserId)
    .maybeSingle();

  if (error) throw error;
  return data?.platform_user_id ?? null;
}

export async function hasVerifiedStudentBinding(
  sbAdmin: TypedSupabaseClient,
  {
    studentPlatformUserId,
    studentWorkspaceUserId,
    wsId,
  }: Omit<ParentLinkKey, 'parentUserId'> & { studentPlatformUserId: string }
) {
  return (
    (await getBoundStudentPlatformUserId(sbAdmin, {
      studentWorkspaceUserId,
      wsId,
    })) === studentPlatformUserId
  );
}

async function activatePendingLink(
  sbAdmin: TypedSupabaseClient,
  {
    linkId,
    parentUserId,
    wsId,
  }: { linkId: string; parentUserId: string; wsId: string }
) {
  const now = new Date().toISOString();

  // Conditional on `pending` so concurrent accepts activate it exactly once.
  return sbAdmin
    .from('tulearn_parent_student_links')
    .update({
      accepted_at: now,
      revoked_at: null,
      status: 'active',
      updated_at: now,
    })
    .eq('id', linkId)
    .eq('ws_id', wsId)
    .eq('parent_user_id', parentUserId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
}

export type AcceptParentLinkResult =
  | { link: ParentLinkRow; ok: true }
  | {
      ok: false;
      reason: 'not_found' | 'not_pending' | 'student_unbound';
    };

/** Parent-only acceptance of a pending link; idempotent once active. */
export async function acceptPendingParentLink(
  sbAdmin: TypedSupabaseClient,
  {
    linkId,
    parentUserId,
    wsId,
  }: { linkId: string; parentUserId: string; wsId: string }
): Promise<AcceptParentLinkResult> {
  const { data, error } = await sbAdmin
    .from('tulearn_parent_student_links')
    .select('*')
    .eq('id', linkId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;

  const link = data as ParentLinkRow | null;
  // Never reveal links that belong to another parent.
  if (!link || link.parent_user_id !== parentUserId) {
    return { ok: false, reason: 'not_found' };
  }
  if (link.status === 'active') return { link, ok: true };
  if (link.status !== 'pending') return { ok: false, reason: 'not_pending' };

  // The student identity may have been re-linked since the admin created this.
  if (
    !(await hasVerifiedStudentBinding(sbAdmin, {
      studentPlatformUserId: link.student_platform_user_id,
      studentWorkspaceUserId: link.student_workspace_user_id,
      wsId,
    }))
  ) {
    return { ok: false, reason: 'student_unbound' };
  }

  const { data: activated, error: activateError } = await activatePendingLink(
    sbAdmin,
    { linkId, parentUserId, wsId }
  );

  if (activateError && activateError.code !== PG_UNIQUE_VIOLATION) {
    throw activateError;
  }
  if (activated) return { link: activated as ParentLinkRow, ok: true };

  // Lost a race, or another link for this parent/student is already active.
  const { active } = await findOpenParentLinks(sbAdmin, {
    parentUserId,
    studentWorkspaceUserId: link.student_workspace_user_id,
    wsId,
  });
  return active
    ? { link: active, ok: true }
    : { ok: false, reason: 'not_pending' };
}

/**
 * Grants access from a consenting parent (verified invite): activates their
 * pending link for the student, or creates an active one.
 */
export async function grantParentLink(
  sbAdmin: TypedSupabaseClient,
  {
    createdBy,
    parentUserId,
    studentPlatformUserId,
    studentWorkspaceUserId,
    wsId,
  }: ParentLinkKey & { createdBy: string | null; studentPlatformUserId: string }
): Promise<ParentLinkRow> {
  const key = { parentUserId, studentWorkspaceUserId, wsId };
  const open = await findOpenParentLinks(sbAdmin, key);
  if (open.active) return open.active;

  if (open.pending) {
    const { data, error } = await activatePendingLink(sbAdmin, {
      linkId: open.pending.id,
      parentUserId,
      wsId,
    });
    if (error && error.code !== PG_UNIQUE_VIOLATION) throw error;
    if (data) return data as ParentLinkRow;
  } else {
    const now = new Date().toISOString();
    const { data, error } = await sbAdmin
      .from('tulearn_parent_student_links')
      .insert({
        accepted_at: now,
        created_by: createdBy,
        parent_user_id: parentUserId,
        status: 'active',
        student_platform_user_id: studentPlatformUserId,
        student_workspace_user_id: studentWorkspaceUserId,
        ws_id: wsId,
      })
      .select()
      .single();
    if (error && error.code !== PG_UNIQUE_VIOLATION) throw error;
    if (data) return data as ParentLinkRow;
  }

  const { active } = await findOpenParentLinks(sbAdmin, key);
  if (active) return active;
  throw new Error('Failed to grant parent link');
}
