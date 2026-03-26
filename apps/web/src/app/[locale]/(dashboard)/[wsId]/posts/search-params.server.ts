import {
  createLoader,
  createSearchParamsCache,
  createSerializer,
} from 'nuqs/server';
import {
  applyDefaultPostStageFilter,
  buildPostsSearchParamsFromRaw,
  normalizeRawPostReviewStage,
  postsSearchParamParsers,
} from './search-params';
import type { RawPostsSearchParams } from './types';

export const postsSearchParamsCache = createSearchParamsCache(
  postsSearchParamParsers
);
export const loadPostsSearchParams = createLoader(postsSearchParamParsers);

const serializePostsSearchParams = createSerializer(postsSearchParamParsers);

export function buildCanonicalPostsSearchParams(
  rawSearchParams: RawPostsSearchParams,
  parsedSearchParams: Awaited<ReturnType<typeof postsSearchParamsCache.parse>>
) {
  const normalizedStage =
    parsedSearchParams.stage ??
    normalizeRawPostReviewStage(rawSearchParams.stage) ??
    null;
  const normalizedSearchParams = applyDefaultPostStageFilter({
    ...parsedSearchParams,
    showAll: normalizedStage ? null : (parsedSearchParams.showAll ?? null),
    stage: normalizedStage,
  });

  const canonicalSearchParams = serializePostsSearchParams(
    normalizedSearchParams
  ).replace(/^\?/, '');
  const currentSearchParams = buildPostsSearchParamsFromRaw(rawSearchParams);

  if (canonicalSearchParams === currentSearchParams.toString()) {
    return null;
  }

  return canonicalSearchParams;
}
