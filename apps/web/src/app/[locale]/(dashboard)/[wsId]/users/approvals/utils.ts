export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';

export const APPROVAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SKIPPED: 'SKIPPED',
} as const;

const STATUS_COLORS: Record<ApprovalStatus, string> = {
  PENDING: 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  APPROVED: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  REJECTED: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  SKIPPED: 'bg-dynamic-gray/10 text-dynamic-gray border-dynamic-gray/20',
};

export function getStatusColorClasses(
  status: ApprovalStatus | undefined | null
): string {
  if (!status || !(status in STATUS_COLORS)) {
    return '';
  }
  return STATUS_COLORS[status as ApprovalStatus];
}

export function canRemoveApproval(post: {
  post_approval_status: ApprovalStatus | string;
  can_remove_approval?: boolean;
}): boolean {
  return (
    post.post_approval_status === 'APPROVED' &&
    post.can_remove_approval === true
  );
}

export const STATUS_LABELS: Record<
  'all' | 'pending' | 'approved' | 'rejected' | 'skipped',
  string
> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  skipped: 'Skipped',
};
