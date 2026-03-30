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

function normalizeSearchParamsForComparison(value: string) {
  const params = new URLSearchParams(value);
  const entries = Array.from(params.entries()).sort(
    ([keyA, valueA], [keyB, valueB]) => {
      if (keyA === keyB) {
        return valueA.localeCompare(valueB);
      }

      return keyA.localeCompare(keyB);
    }
  );

  return new URLSearchParams(entries).toString();
}

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
  const canonicalSearchParamsEncoded = new URLSearchParams(
    canonicalSearchParams
  ).toString();
  const currentSearchParams = buildPostsSearchParamsFromRaw(rawSearchParams);

  if (
    normalizeSearchParamsForComparison(canonicalSearchParamsEncoded) ===
    normalizeSearchParamsForComparison(currentSearchParams.toString())
  ) {
    return null;
  }

  return canonicalSearchParamsEncoded;
}
