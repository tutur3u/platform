import {
  isPostApprovalStatus,
  isPostEmailQueueStatus,
  isPostReviewStage,
  type PostsSearchParams,
} from '../post-types';

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseWorkspacePostsSearchParams(
  searchParams: URLSearchParams
): PostsSearchParams {
  const stage = searchParams.get('stage') ?? undefined;
  const queueStatus = searchParams.get('queueStatus') ?? undefined;
  const approvalStatus = searchParams.get('approvalStatus') ?? undefined;

  return {
    approvalStatus: isPostApprovalStatus(approvalStatus)
      ? approvalStatus
      : undefined,
    cursor: searchParams.get('cursor') ?? undefined,
    end: searchParams.get('end') ?? undefined,
    excludedGroups: searchParams.getAll('excludedGroups'),
    includedGroups: searchParams.getAll('includedGroups'),
    page: parsePositiveInteger(searchParams.get('page'), 1),
    pageSize: parsePositiveInteger(searchParams.get('pageSize'), 10),
    queueStatus: isPostEmailQueueStatus(queueStatus) ? queueStatus : undefined,
    showAll: searchParams.get('showAll') === 'true' || undefined,
    stage: isPostReviewStage(stage) ? stage : undefined,
    start: searchParams.get('start') ?? undefined,
    userId: searchParams.get('userId') ?? undefined,
  };
}
