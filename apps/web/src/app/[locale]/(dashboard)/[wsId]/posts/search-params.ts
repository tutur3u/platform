import {
  DEFAULT_POST_REVIEW_STAGE,
  isPostReviewStage,
  type PostReviewStage,
  type PostsSearchParams,
} from './types';

export function normalizeArrayParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}

export function normalizePostReviewStage(
  value?: string | string[]
): PostReviewStage | undefined {
  return normalizeArrayParam(value).find(isPostReviewStage);
}

export function normalizePostReviewStages(
  value?: string | string[]
): PostReviewStage[] {
  const stage = normalizePostReviewStage(value);
  return stage ? [stage] : [];
}

export function shouldApplyDefaultPostStageFilter(
  searchParams: PostsSearchParams
) {
  return (
    !normalizePostReviewStage(searchParams.stage) &&
    !searchParams.approvalStatus &&
    !searchParams.queueStatus
  );
}

export function buildPostsSearchParams(
  searchParams: PostsSearchParams
): URLSearchParams {
  const params = new URLSearchParams();

  const appendArray = (key: string, value?: string | string[]) => {
    for (const item of normalizeArrayParam(value)) {
      params.append(key, item);
    }
  };

  appendArray('includedGroups', searchParams.includedGroups);
  appendArray('excludedGroups', searchParams.excludedGroups);
  if (searchParams.page) params.set('page', searchParams.page);
  if (searchParams.pageSize) params.set('pageSize', searchParams.pageSize);
  const stage = normalizePostReviewStage(searchParams.stage);
  if (stage) params.set('stage', stage);
  if (searchParams.userId) params.set('userId', searchParams.userId);
  if (searchParams.queueStatus)
    params.set('queueStatus', searchParams.queueStatus);
  if (searchParams.approvalStatus)
    params.set('approvalStatus', searchParams.approvalStatus);
  if (searchParams.cursor) params.set('cursor', searchParams.cursor);

  return params;
}

export function buildCanonicalPostsSearchParams(
  searchParams: PostsSearchParams
) {
  if (!shouldApplyDefaultPostStageFilter(searchParams)) {
    return null;
  }

  const params = buildPostsSearchParams({
    ...searchParams,
    stage: DEFAULT_POST_REVIEW_STAGE,
  });

  return params.toString();
}
