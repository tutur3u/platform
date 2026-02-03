export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const APPROVAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

const STATUS_COLORS: Record<ApprovalStatus, string> = {
  PENDING: 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  APPROVED: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  REJECTED: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
};

export function getStatusColorClasses(
  status: ApprovalStatus | undefined | null
): string {
  if (!status || !(status in STATUS_COLORS)) {
    return '';
  }
  return STATUS_COLORS[status as ApprovalStatus];
}

export function canSendEmail(post: {
  post_approval_status: ApprovalStatus | string;
}): boolean {
  return post.post_approval_status === 'APPROVED';
}

export const STATUS_LABELS: Record<
  'all' | 'pending' | 'approved' | 'rejected',
  string
> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};
