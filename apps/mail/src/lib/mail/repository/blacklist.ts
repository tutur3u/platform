import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getFailedMailRecipients } from '../failed-recipients';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { getMailMessage } from './messages';

export const MAIL_BLACKLIST_REASONS = {
  inactive: 'Inactive/Abandoned',
  verification_failed: 'Verification Failed',
  spam: 'Spam/Phishing',
  policy_violation: 'Policy Violation',
  fraud: 'Fraud/Abuse',
} as const;

export async function getMailBlacklistContext(
  ctx: MailRouteContext,
  mailboxId: string,
  messageId: string
) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  // Match the global blacklist's root-workspace RLS, with the Infrastructure UI permission too.
  const { data: linked, error } = await ctx.supabase
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', ctx.user.id)
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .maybeSingle();
  if (error)
    throw new Error(`Failed to verify blacklist access: ${error.message}`);
  if (!linked) return null;
  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    user: ctx.user,
  });
  if (!permissions?.containsPermission('view_infrastructure')) return null;
  const message = await getMailMessage({ ctx, mailboxId, messageId });
  if (!message) return null;
  return { admin: access.admin, recipients: getFailedMailRecipients(message) };
}
