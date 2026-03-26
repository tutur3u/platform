import {
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import {
  DEFAULT_POST_REVIEW_STAGE,
  POST_APPROVAL_STATUSES,
  POST_REVIEW_STAGES,
  type PostsSearchParams,
  type RawPostsSearchParams,
} from './types';
import { POST_EMAIL_QUEUE_STATUSES } from '@/lib/post-email-queue/statuses';

const postsNavigationOptions = {
  shallow: false,
} as const;

export const postsSearchParamParsers = {
  approvalStatus: parseAsStringLiteral(POST_APPROVAL_STATUSES).withOptions(
    postsNavigationOptions
  ),
  cursor: parseAsString.withOptions(postsNavigationOptions),
  excludedGroups: parseAsNativeArrayOf(parseAsString)
    .withDefault([])
    .withOptions(postsNavigationOptions),
  includedGroups: parseAsNativeArrayOf(parseAsString)
    .withDefault([])
    .withOptions(postsNavigationOptions),
  page: parseAsInteger.withDefault(1).withOptions(postsNavigationOptions),
  pageSize: parseAsInteger.withDefault(10).withOptions(postsNavigationOptions),
  queueStatus: parseAsStringLiteral(POST_EMAIL_QUEUE_STATUSES).withOptions(
    postsNavigationOptions
  ),
  stage: parseAsStringLiteral(POST_REVIEW_STAGES).withOptions(
    postsNavigationOptions
  ),
  userId: parseAsString.withOptions(postsNavigationOptions),
};

export function normalizeRawArrayParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}

export function normalizeRawPostReviewStage(
  value?: string | string[]
): PostsSearchParams['stage'] {
  const candidate = normalizeRawArrayParam(value).find((entry) =>
    POST_REVIEW_STAGES.includes(entry as (typeof POST_REVIEW_STAGES)[number])
  );

  return candidate
    ? (candidate as PostsSearchParams['stage'])
    : null;
}

export function shouldApplyDefaultPostStageFilter(
  searchParams: Pick<PostsSearchParams, 'approvalStatus' | 'queueStatus' | 'stage'>
) {
  return (
    !searchParams.stage &&
    !searchParams.approvalStatus &&
    !searchParams.queueStatus
  );
}

export function applyDefaultPostStageFilter(
  searchParams: PostsSearchParams
): PostsSearchParams {
  if (!shouldApplyDefaultPostStageFilter(searchParams)) {
    return searchParams;
  }

  return {
    ...searchParams,
    stage: DEFAULT_POST_REVIEW_STAGE,
  };
}

export function buildPostsSearchParamsFromRaw(
  searchParams: RawPostsSearchParams
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          params.append(key, item);
        }
      }
      continue;
    }

    params.set(key, value);
  }

  return params;
}
