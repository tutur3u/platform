import type {
  PostApprovalStatus,
  PostEmailQueueStatus,
} from '@tuturuuu/users-core/lib/post-types';

export function normalizePostEmailQueueStatus({
  approvalStatus,
  emailId,
  queueStatus,
}: {
  approvalStatus?: PostApprovalStatus | null;
  emailId?: string | null;
  queueStatus?: PostEmailQueueStatus | null;
}): PostEmailQueueStatus | undefined {
  if (queueStatus === 'queued' && approvalStatus !== 'APPROVED' && !emailId) {
    return undefined;
  }

  if (queueStatus) {
    return queueStatus;
  }

  if (emailId) {
    return 'sent';
  }

  return undefined;
}
