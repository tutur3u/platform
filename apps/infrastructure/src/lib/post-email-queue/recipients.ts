import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { GroupPostCheck } from '@tuturuuu/types/db';
import { preloadBlockedEmailCache } from '@/lib/email-blacklist';
import { isWorkspaceUserInactiveForPostEmail } from './eligibility';
import { getPostEmailGroupMemberIds } from './group-membership';
import { buildEligibleRecipientsDiagnostics } from './logic';
import type {
  EligibleRecipient,
  EligibleRecipientCheckRow,
  EligibleRecipientsDiagnostics,
} from './types';
import { chunkArray, isValidEmailAddress } from './utils';

function debugLog(message: string, details: unknown) {
  if (process.env.POST_EMAIL_QUEUE_DEBUG === '1')
    console.info(message, details);
}

export async function getEligibleRecipients(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    postId,
    groupId,
    userIds,
  }: {
    wsId: string;
    postId: string;
    groupId: string;
    userIds?: string[];
  }
): Promise<{
  diagnostics: EligibleRecipientsDiagnostics;
  recipients: EligibleRecipient[];
}> {
  const dedupedUserIds =
    userIds && userIds.length > 0 ? [...new Set(userIds)] : null;
  const userIdChunks = dedupedUserIds ? chunkArray(dedupedUserIds) : [null];
  const rows: EligibleRecipientCheckRow[] = [];
  const allCheckRows: Array<
    Pick<
      GroupPostCheck,
      'user_id' | 'is_completed' | 'approval_status' | 'approved_by'
    >
  > = [];

  for (const userIdChunk of userIdChunks) {
    let query = sbAdmin
      .schema('private')
      .from('user_group_post_checks')
      .select(
        'user_id, is_completed, approval_status, approved_by, user:workspace_users!user_id(id, email, ws_id, archived, archived_until)'
      )
      .eq('post_id', postId)
      .eq('user.ws_id', wsId);

    if (userIdChunk && userIdChunk.length > 0) {
      query = query.in('user_id', userIdChunk);
    }

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as EligibleRecipientCheckRow[]));
  }

  for (const userIdChunk of userIdChunks) {
    let allChecksQuery = sbAdmin
      .schema('private')
      .from('user_group_post_checks')
      .select('user_id, is_completed, approval_status, approved_by')
      .eq('post_id', postId);

    if (userIdChunk && userIdChunk.length > 0) {
      allChecksQuery = allChecksQuery.in('user_id', userIdChunk);
    }

    const { data: allChecksData, error: allChecksError } = await allChecksQuery;
    if (allChecksError) throw allChecksError;
    allCheckRows.push(
      ...((allChecksData ?? []) as Array<
        Pick<
          GroupPostCheck,
          'user_id' | 'is_completed' | 'approval_status' | 'approved_by'
        >
      >)
    );
  }
  const foundUserIds = new Set(rows.map((r) => r.user_id));
  const missingFromUserTable = allCheckRows
    .filter((r) => !foundUserIds.has(r.user_id))
    .map((r) => r.user_id);

  // Enhanced diagnostics
  const diagnostics = {
    totalCheckRows: allCheckRows.length,
    rowsWithUserData: rows.length,
    missingFromUserTable: missingFromUserTable.length,
    missingIsCompleted: [] as string[],
    notApproved: [] as Array<{ userId: string; status: string | null }>,
    missingUserObject: [] as string[],
    missingEmail: [] as Array<{ userId: string; email: unknown }>,
    kept: [] as string[],
  };

  const members = await getPostEmailGroupMemberIds(sbAdmin, {
    wsId,
    groupId,
    userIds: rows.map((row) => row.user_id),
  });
  const filtered = rows
    .filter((row) => members.has(row.user_id))
    .filter((row) => {
      const hasCompletion = row.is_completed !== null;
      const isApproved = row.approval_status === 'APPROVED';
      const hasUser = row.user != null;
      const hasEmail = row.user?.email != null && row.user?.email !== '';
      const isInactive = isWorkspaceUserInactiveForPostEmail(row.user);

      if (!hasCompletion) diagnostics.missingIsCompleted.push(row.user_id);
      if (hasCompletion && !isApproved)
        diagnostics.notApproved.push({
          userId: row.user_id,
          status: row.approval_status,
        });
      if (hasCompletion && isApproved && (!hasUser || isInactive))
        diagnostics.missingUserObject.push(row.user_id);
      if (hasCompletion && isApproved && hasUser && !hasEmail)
        diagnostics.missingEmail.push({
          userId: row.user_id,
          email: row.user?.email,
        });

      const keep =
        hasCompletion && isApproved && hasUser && !isInactive && hasEmail;
      if (keep) diagnostics.kept.push(row.user_id);
      return keep;
    })
    .map((row) => ({
      user_id: row.user_id,
      email: row.user!.email,
      approved_by: row.approved_by,
    }));

  const withValidEmail = filtered.filter(
    (row): row is EligibleRecipient & { email: string } =>
      isValidEmailAddress(row.email)
  );
  const invalidEmailCount = filtered.length - withValidEmail.length;
  const blockedEmailCache = await preloadBlockedEmailCache(
    sbAdmin,
    withValidEmail.map((row) => row.email)
  );
  const deliverableRecipients = withValidEmail.filter(
    (row) => !blockedEmailCache.get(row.email.trim().toLowerCase())
  );
  const blockedEmailCount =
    withValidEmail.length - deliverableRecipients.length;
  const diagnosticsSummary = buildEligibleRecipientsDiagnostics({
    eligibleRecipients: deliverableRecipients.length,
    invalidEmail: invalidEmailCount + blockedEmailCount,
    missingEmail: diagnostics.missingEmail.length,
    missingFromUserTable: diagnostics.missingFromUserTable,
    missingIsCompleted: diagnostics.missingIsCompleted.length,
    missingUserObject: diagnostics.missingUserObject.length,
    notApproved: diagnostics.notApproved.length,
    rowsWithUserData: diagnostics.rowsWithUserData,
    totalCheckRows: diagnostics.totalCheckRows,
  });

  // Log diagnostics - always log when users are skipped due to missing emails
  const hasSkippedUsers = diagnosticsSummary.missingEmail > 0;
  const hasDiagnostics =
    allCheckRows.length !== rows.length ||
    diagnostics.missingIsCompleted.length > 0 ||
    diagnostics.notApproved.length > 0 ||
    diagnostics.missingUserObject.length > 0 ||
    hasSkippedUsers;

  if (hasDiagnostics || allCheckRows.length !== withValidEmail.length) {
    debugLog('[getEligibleRecipients] Processing results', {
      summary: {
        totalCheckRows: diagnostics.totalCheckRows,
        rowsWithUserData: diagnostics.rowsWithUserData,
        eligibleForEmail: diagnosticsSummary.eligibleRecipients,
        skippedNoEmail: diagnosticsSummary.missingEmail,
      },
      filters: {
        missingIsCompleted: diagnosticsSummary.missingCompletion,
        notApproved: diagnosticsSummary.notApproved,
        missingUserObject: diagnostics.missingUserObject.length,
        missingEmail: diagnosticsSummary.missingEmail,
        kept: diagnostics.kept.length,
      },
    });
  }

  return {
    diagnostics: diagnosticsSummary,
    recipients: deliverableRecipients,
  };
}
