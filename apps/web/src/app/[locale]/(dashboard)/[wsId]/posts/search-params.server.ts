import { createSearchParamsCache, createSerializer } from 'nuqs/server';
import type { RawPostsSearchParams } from './types';
import {
  applyDefaultPostStageFilter,
  buildPostsSearchParamsFromRaw,
  normalizeRawPostReviewStage,
  postsSearchParamParsers,
} from './search-params';

export const postsSearchParamsCache =
  createSearchParamsCache(postsSearchParamParsers);

const serializePostsSearchParams = createSerializer(postsSearchParamParsers);

export function buildCanonicalPostsSearchParams(
  rawSearchParams: RawPostsSearchParams,
  parsedSearchParams: Awaited<
    ReturnType<typeof postsSearchParamsCache.parse>
  >
) {
  const normalizedSearchParams = applyDefaultPostStageFilter({
    ...parsedSearchParams,
    stage:
      parsedSearchParams.stage ??
      normalizeRawPostReviewStage(rawSearchParams.stage) ??
      null,
  });

  const canonicalSearchParams = serializePostsSearchParams(
    normalizedSearchParams
  );
  const currentSearchParams = buildPostsSearchParamsFromRaw(rawSearchParams);

  if (canonicalSearchParams === currentSearchParams.toString()) {
    return null;
  }

  return canonicalSearchParams;
}
