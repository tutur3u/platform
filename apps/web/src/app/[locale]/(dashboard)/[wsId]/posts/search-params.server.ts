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

function pickFirstRawValue(value?: string | string[]): string | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry.trim().length > 0);
    return first ?? null;
  }

  return value && value.trim().length > 0 ? value : null;
}

function normalizeIsoDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeExclusiveEndDate(value?: string | null): string | null {
  const normalized = normalizeIsoDate(value);
  if (!normalized) {
    return null;
  }

  const parsed = dayjs(normalized);
  if (parsed.millisecond() === 999) {
    return parsed.add(1, 'millisecond').toISOString();
  }

  return normalized;
}

export function buildCanonicalPostsSearchParams(
  rawSearchParams: RawPostsSearchParams,
  parsedSearchParams: Awaited<ReturnType<typeof postsSearchParamsCache.parse>>,
  defaults?: {
    start?: string | null;
    end?: string | null;
  }
) {
  let normalizedStart = normalizeIsoDate(
    parsedSearchParams.start ?? pickFirstRawValue(rawSearchParams.start)
  );
  let normalizedEnd = normalizeExclusiveEndDate(
    parsedSearchParams.end ?? pickFirstRawValue(rawSearchParams.end)
  );

  if (
    normalizedStart &&
    normalizedEnd &&
    dayjs(normalizedStart).isAfter(dayjs(normalizedEnd))
  ) {
    normalizedStart = null;
    normalizedEnd = null;
  }

  const normalizedStage =
    parsedSearchParams.stage ??
    normalizeRawPostReviewStage(rawSearchParams.stage) ??
    null;
  const normalizedSearchParams = applyDefaultPostStageFilter({
    ...parsedSearchParams,
    end: normalizedEnd,
    showAll: normalizedStage ? null : (parsedSearchParams.showAll ?? null),
    start: normalizedStart,
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

  const endExclusive = dayjs().tz(timezoneToUse).add(1, 'day').startOf('day');
  const start = endExclusive.subtract(30, 'day');

  return {
    start: start.toISOString(),
    end: endExclusive.toISOString(),
  };
}
