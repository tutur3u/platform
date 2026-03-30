import { isValidTimezone } from '@tuturuuu/utils/timezone';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
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

dayjs.extend(utc);
dayjs.extend(timezone);

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
  parsedSearchParams: Awaited<ReturnType<typeof postsSearchParamsCache.parse>>,
  defaults?: {
    start?: string | null;
    end?: string | null;
  }
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

  const shouldApplyDefaultDateRange =
    !normalizedSearchParams.start &&
    !normalizedSearchParams.end &&
    Boolean(defaults?.start && defaults?.end);

  const normalizedWithDateRange = shouldApplyDefaultDateRange
    ? {
        ...normalizedSearchParams,
        start: defaults?.start ?? null,
        end: defaults?.end ?? null,
      }
    : normalizedSearchParams;

  const canonicalSearchParams = serializePostsSearchParams(
    normalizedWithDateRange
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

export function buildDefaultPostsDateRange(timezoneSetting?: string | null): {
  start: string;
  end: string;
} {
  const timezoneToUse =
    timezoneSetting &&
    timezoneSetting !== 'auto' &&
    isValidTimezone(timezoneSetting)
      ? timezoneSetting
      : 'UTC';

  const end = dayjs().tz(timezoneToUse).endOf('day');
  const start = end.subtract(29, 'day').startOf('day');

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
