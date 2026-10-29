import { createHash, randomBytes } from 'node:crypto';
import { sendWorkspaceInviteEmail } from '@tuturuuu/email-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { Tables } from '@tuturuuu/types/supabase';
import { LEARN_APP_URL } from '@/constants/common';
import {
  getBoundStudentPlatformUserId,
  grantParentLink,
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

  const revokeInvites = (ids: string[]) =>
    sbAdmin
      .from('tulearn_parent_invites')
      .update({
        revoked_at: new Date().toISOString(),
        status: 'revoked',
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('status', 'pending');

  let delivered = false;
  try {
    const result = await sendWorkspaceInviteEmail(
      wsId,
      parentEmail,
      buildParentInviteEmail(buildParentInviteAcceptUrl(wsId, token)),
      {
        entityId: invite.id,
        entityType: 'tulearn_parent_invite',
        templateType: 'tulearn-parent-invite',
        userId: invitedBy,
      }
    );
    delivered = result.success;
    if (!delivered) {
      console.error('Failed to email Tulearn parent invite', result.error);
    }
  } catch (sendError) {
    console.error('Failed to email Tulearn parent invite', sendError);
  }

  if (!delivered) {
    await revokeInvites([invite.id]);
    return { ok: false, reason: 'delivery_failed' };
  }

  // A newer invite supersedes older pending tokens for the same recipient.
  const { data: pendingInvites, error: pendingError } = await sbAdmin
    .from('tulearn_parent_invites')
    .select('id, parent_email')
    .eq('ws_id', wsId)
    .eq('student_workspace_user_id', studentWorkspaceUserId)
    .eq('status', 'pending')
    .neq('id', invite.id);
  const supersededIds = (pendingInvites ?? [])
    .filter((pending) => emailsMatch(pending.parent_email, parentEmail))
    .map((pending) => pending.id);
  const { error: supersedeError } = supersededIds.length
    ? await revokeInvites(supersededIds)
    : { error: null };
  if (pendingError || supersedeError) {
    console.error(
      'Failed to supersede earlier parent invites',
      pendingError ?? supersedeError
    );
  }

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
 * Single-use acceptance: hashes the presented token, requires the caller's
 * verified email to equal the invited email, claims the invite with a
 * conditional update on `pending`, then grants the active link.
 * Re-submitting by the same parent repairs/returns the existing link.
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

  let claimed =
    invite.status === 'accepted' && invite.parent_user_id === userId;

  if (!claimed) {
    if (invite.status !== 'pending')
      return { ok: false, reason: 'unavailable' };

    const now = new Date().toISOString();
    if (invite.expires_at <= now) {
      await sbAdmin
        .from('tulearn_parent_invites')
        .update({ status: 'expired', updated_at: now })
        .eq('id', invite.id)
        .eq('status', 'pending');
      return { ok: false, reason: 'expired' };
    }

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
    // Someone else consumed or expired it between our read and the claim.
    if (!claim) return { ok: false, reason: 'unavailable' };
    claimed = true;
  }

  const studentPlatformUserId = await getBoundStudentPlatformUserId(sbAdmin, {
    studentWorkspaceUserId: invite.student_workspace_user_id,
    wsId,
  });
  if (!studentPlatformUserId) return { ok: false, reason: 'student_unbound' };

  const link = await grantParentLink(sbAdmin, {
    createdBy: invite.invited_by,
    parentUserId: userId,
    studentPlatformUserId,
    studentWorkspaceUserId: invite.student_workspace_user_id,
    wsId,
  });

  return { link, ok: true };
}
