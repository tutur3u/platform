import { createHash, randomBytes } from 'node:crypto';
import { EmailService } from '@tuturuuu/email-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Tables } from '@tuturuuu/types/supabase';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { LEARN_APP_URL } from '@/constants/common';
import {
  findOpenParentLinks,
  getBoundStudentPlatformUserId,
  grantParentLink,
  hasCompletedInviteAcceptance,
  type ParentLinkRow,
} from './parent-links';

export type ParentInviteRow = Tables<'tulearn_parent_invites'>;

export const PARENT_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const INVITE_COLUMNS =
  'id, ws_id, student_workspace_user_id, parent_email, status, expires_at';

export function hashParentInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function emailsMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * The account email is only usable as proof of identity when auth has
 * confirmed it; app-session claims and profile rows are not enough.
 */
export async function getVerifiedAccountEmail(
  sbAdmin: TypedSupabaseClient,
  userId: string
) {
  const { data, error } = await sbAdmin.auth.admin.getUserById(userId);
  if (error) throw error;

  const authUser = data.user;
  return authUser?.email && authUser.email_confirmed_at ? authUser.email : null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildParentInviteAcceptUrl(wsId: string, token: string) {
  const url = new URL('/parent-invite', LEARN_APP_URL);
  url.searchParams.set('workspace', wsId);
  url.searchParams.set('token', token);
  return url.toString();
}

function buildParentInviteEmail(acceptUrl: string) {
  const href = escapeHtml(acceptUrl);

  return {
    subject: '[Tuturuuu] Parent access invitation / Lời mời liên kết phụ huynh',
    html: `<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; line-height: 1.5; color: #111;">
    <p>You have been invited to follow a learner's progress in Tuturuuu Learn as a parent.</p>
    <p>Sign in with this email address and accept the invitation to share access. The link is valid for 14 days and can be used once.</p>
    <p><a href="${href}">Accept the invitation</a></p>
    <hr />
    <p>Bạn được mời theo dõi tiến trình học tập của học viên trên Tuturuuu Learn với vai trò phụ huynh.</p>
    <p>Hãy đăng nhập bằng địa chỉ email này và chấp nhận lời mời để chia sẻ quyền truy cập. Liên kết có hiệu lực trong 14 ngày và chỉ dùng được một lần.</p>
    <p><a href="${href}">Chấp nhận lời mời</a></p>
    <p style="color: #666; font-size: 12px;">If you did not expect this email, you can ignore it. / Nếu bạn không mong đợi email này, hãy bỏ qua.</p>
  </body>
</html>`,
  };
}

/**
 * Revokes pending invites, either by id or every pending invite for the
 * student addressed to `parentEmail`. Failures are logged and reported as
 * `false`, not thrown, so a revocation hiccup never undoes the action that
 * triggered it and callers can surface it.
 */
export async function revokePendingParentInvites(
  sbAdmin: TypedSupabaseClient,
  target:
    | { ids: string[] }
    | {
        exceptId?: string;
        parentEmail: string;
        studentWorkspaceUserId: string;
        wsId: string;
      }
): Promise<boolean> {
  let ids: string[];
  if ('ids' in target) {
    ids = target.ids;
  } else {
    const { data, error } = await sbAdmin
      .from('tulearn_parent_invites')
      .select('id, parent_email')
      .eq('ws_id', target.wsId)
      .eq('student_workspace_user_id', target.studentWorkspaceUserId)
      .eq('status', 'pending');
    if (error) {
      console.error('Failed to list pending parent invites', error);
      return false;
    }
    ids = (data ?? [])
      .filter(
        (pending) =>
          pending.id !== target.exceptId &&
          emailsMatch(pending.parent_email, target.parentEmail)
      )
      .map((pending) => pending.id);
  }

  if (!ids.length) return true;

  const now = new Date().toISOString();
  const { error } = await sbAdmin
    .from('tulearn_parent_invites')
    .update({ revoked_at: now, status: 'revoked', updated_at: now })
    .in('id', ids)
    .eq('status', 'pending');
  if (error) console.error('Failed to revoke parent invites', error);
  return !error;
}

/**
 * Creates a pending invite and emails the single-use token to the invited
 * parent. The token is never returned to the caller; if delivery fails the
 * invite is revoked because no one holds its token.
 */
export async function createAndSendParentInvite(
  sbAdmin: TypedSupabaseClient,
  {
    invitedBy,
    parentEmail,
    studentWorkspaceUserId,
    wsId,
  }: {
    invitedBy: string;
    parentEmail: string;
    studentWorkspaceUserId: string;
    wsId: string;
  }
): Promise<
  | { invite: Partial<ParentInviteRow>; ok: true }
  | { ok: false; reason: 'delivery_failed' }
> {
  const token = randomBytes(32).toString('hex');
  const { data: invite, error } = await sbAdmin
    .from('tulearn_parent_invites')
    .insert({
      expires_at: new Date(Date.now() + PARENT_INVITE_TTL_MS).toISOString(),
      invited_by: invitedBy,
      parent_email: parentEmail,
      student_workspace_user_id: studentWorkspaceUserId,
      token_hash: hashParentInviteToken(token),
      ws_id: wsId,
    })
    .select(INVITE_COLUMNS)
    .single();

  if (error) throw error;

  let delivered = false;
  try {
    // Workspaces without their own SES credentials send through the root
    // account; rate limits, blocklist and audit stay attributed to `wsId`.
    const { data: ownCredentials, error: credentialsError } = await sbAdmin
      .from('workspace_email_credentials')
      .select('ws_id')
      .eq('ws_id', wsId)
      .maybeSingle();
    if (credentialsError) throw credentialsError;

    const service = await EmailService.fromWorkspace(
      wsId,
      ownCredentials ? undefined : { credentialWorkspaceId: ROOT_WORKSPACE_ID }
    );
    const result = await service.send({
      content: buildParentInviteEmail(buildParentInviteAcceptUrl(wsId, token)),
      metadata: {
        entityId: invite.id,
        entityType: 'tulearn_parent_invite',
        isInvite: true,
        templateType: 'tulearn-parent-invite',
        userId: invitedBy,
        wsId,
      },
      recipients: { to: [parentEmail] },
    });
    delivered = result.success;
    if (!delivered) {
      console.error('Failed to email Tulearn parent invite', result.error);
    }
  } catch (sendError) {
    console.error('Failed to email Tulearn parent invite', sendError);
  }

  if (!delivered) {
    await revokePendingParentInvites(sbAdmin, { ids: [invite.id] });
    return { ok: false, reason: 'delivery_failed' };
  }

  // A newer invite supersedes older pending tokens for the same recipient.
  await revokePendingParentInvites(sbAdmin, {
    exceptId: invite.id,
    parentEmail,
    studentWorkspaceUserId,
    wsId,
  });

  return { invite, ok: true };
}

export type AcceptParentInviteResult =
  | { link: ParentLinkRow; ok: true }
  | {
      ok: false;
      reason:
        | 'email_mismatch'
        | 'expired'
        | 'not_found'
        | 'student_unbound'
        | 'unavailable';
    };

/**
 * Resumes an invite this parent already accepted. It returns an existing
 * ACTIVE link, and never grants again once the acceptance was carried out
 * (see `hasCompletedInviteAcceptance`), so an admin revoke or re-open sticks.
 * The one repair is an interrupted acceptance, where the claim succeeded but
 * no link carries the invite's acceptance time yet: it completes the grant
 * with that same time, so a repeat is recognised as complete.
 */
async function resumeAcceptedParentInvite(
  sbAdmin: TypedSupabaseClient,
  invite: ParentInviteRow,
  userId: string,
  wsId: string
): Promise<AcceptParentInviteResult> {
  if (invite.expires_at <= new Date().toISOString()) {
    return { ok: false, reason: 'expired' };
  }

  const key = {
    parentUserId: userId,
    studentWorkspaceUserId: invite.student_workspace_user_id,
    wsId,
  };
  const { active } = await findOpenParentLinks(sbAdmin, key);
  if (active) return { link: active, ok: true };

  if (!invite.accepted_at) return { ok: false, reason: 'unavailable' };

  // Once any link for this parent and student carries this acceptance (or a
  // later revocation), the acceptance was carried out and access is governed
  // by admins and the parent, not by the token. A concurrent submit may also
  // have granted the link since the read above.
  if (await hasCompletedInviteAcceptance(sbAdmin, key, invite.accepted_at)) {
    const { active: granted } = await findOpenParentLinks(sbAdmin, key);
    return granted
      ? { link: granted, ok: true }
      : { ok: false, reason: 'unavailable' };
  }

  const studentPlatformUserId = await getBoundStudentPlatformUserId(sbAdmin, {
    studentWorkspaceUserId: invite.student_workspace_user_id,
    wsId,
  });
  if (!studentPlatformUserId) return { ok: false, reason: 'student_unbound' };

  const link = await grantParentLink(sbAdmin, {
    acceptedAt: invite.accepted_at,
    createdBy: invite.invited_by,
    parentUserId: userId,
    studentPlatformUserId,
    studentWorkspaceUserId: invite.student_workspace_user_id,
    wsId,
  });
  return { link, ok: true };
}

/**
 * Single-use acceptance: hashes the presented token, requires the caller's
 * verified email to equal the invited email, confirms the learner is still
 * bound, claims the invite with a conditional update on `pending`, then grants
 * the active link. Re-submitting by the same parent resumes an interrupted
 * acceptance but never restores access an admin revoked.
 */
export async function acceptParentInvite(
  sbAdmin: TypedSupabaseClient,
  {
    token,
    userId,
    verifiedEmail,
    wsId,
  }: {
    token: string;
    userId: string;
    verifiedEmail: string | null;
    wsId: string;
  }
): Promise<AcceptParentInviteResult> {
  const { data, error } = await sbAdmin
    .from('tulearn_parent_invites')
    .select('*')
    .eq('token_hash', hashParentInviteToken(token))
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) throw error;

  const invite = data as ParentInviteRow | null;
  if (!invite) return { ok: false, reason: 'not_found' };
  if (!verifiedEmail || !emailsMatch(verifiedEmail, invite.parent_email)) {
    return { ok: false, reason: 'email_mismatch' };
  }

  if (invite.status === 'accepted') {
    return invite.parent_user_id === userId
      ? resumeAcceptedParentInvite(sbAdmin, invite, userId, wsId)
      : { ok: false, reason: 'unavailable' };
  }
  if (invite.status !== 'pending') return { ok: false, reason: 'unavailable' };

  const now = new Date().toISOString();
  if (invite.expires_at <= now) {
    await sbAdmin
      .from('tulearn_parent_invites')
      .update({ status: 'expired', updated_at: now })
      .eq('id', invite.id)
      .eq('status', 'pending');
    return { ok: false, reason: 'expired' };
  }

  // Checked before the claim so an unbound learner does not burn the invite.
  const studentPlatformUserId = await getBoundStudentPlatformUserId(sbAdmin, {
    studentWorkspaceUserId: invite.student_workspace_user_id,
    wsId,
  });
  if (!studentPlatformUserId) return { ok: false, reason: 'student_unbound' };

  const { data: claim, error: claimError } = await sbAdmin
    .from('tulearn_parent_invites')
    .update({
      accepted_at: now,
      parent_user_id: userId,
      status: 'accepted',
      updated_at: now,
    })
    .eq('id', invite.id)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .select('id')
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claim) {
    // Lost the race. If the winner was this same parent (a double submit),
    // hand back their link instead of reporting the invite as spent.
    const { data: latest, error: latestError } = await sbAdmin
      .from('tulearn_parent_invites')
      .select('*')
      .eq('id', invite.id)
      .maybeSingle();
    if (latestError) throw latestError;

    const current = latest as ParentInviteRow | null;
    return current?.status === 'accepted' && current.parent_user_id === userId
      ? resumeAcceptedParentInvite(sbAdmin, current, userId, wsId)
      : { ok: false, reason: 'unavailable' };
  }

  const link = await grantParentLink(sbAdmin, {
    acceptedAt: now,
    createdBy: invite.invited_by,
    parentUserId: userId,
    studentPlatformUserId,
    studentWorkspaceUserId: invite.student_workspace_user_id,
    wsId,
  });

  return { link, ok: true };
}
