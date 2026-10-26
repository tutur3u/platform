import {
  type InternalApiClientOptions,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api/client';
import type {
  HabitTracker,
  HabitTrackerEntry,
} from '@tuturuuu/types/primitives/HabitTracker';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { Effect } from '@tuturuuu/utils/effect';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { MiraToolContext } from '../mira-tool-types';

dayjs.extend(utc);
dayjs.extend(timezone);

export const KG_PER_LB = 0.45359237;
/** The Tasks entry list returns at most this many recent entries per tracker. */
export const ENTRY_PAGE_LIMIT = 50;
export const BODY_WEIGHT_KG_BOUNDS = { min: 2, max: 650 } as const;

export type WeightUnit = 'kg' | 'lb';

export type HabitApiResolution =
  | { ok: true; options: InternalApiClientOptions }
  | { ok: false; result: { success: false; error: string } };

/**
 * Habit trackers are served by the Tasks satellite. Forward the caller's own
 * auth so the satellite enforces membership, the habits feature flag and RLS.
 */
export function resolveHabitApi(ctx: MiraToolContext): HabitApiResolution {
  if (!ctx.requestHeaders)
    return {
      ok: false,
      result: {
        success: false,
        error:
          'Habit trackers are unavailable in this session. Open Tasks > Habits to log or review entries.',
      },
    };
  const baseUrl = resolveInternalAppUrl({
    appName: 'tasks',
    candidates: [
      process.env.TASKS_APP_URL,
      process.env.NEXT_PUBLIC_TASKS_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://tasks.tuturuuu.com'
        : 'https://tasks.tuturuuu.localhost',
  });
  const target = new URL(baseUrl);
  const localDevelopment =
    process.env.NODE_ENV !== 'production' &&
    (['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      target.hostname.endsWith('.localhost'));
  if (target.protocol !== 'https:' && !localDevelopment)
    return {
      ok: false,
      result: {
        success: false,
        error: 'Habit trackers require a secure HTTPS connection.',
      },
    };
  return {
    ok: true,
    options: withForwardedInternalApiAuth(ctx.requestHeaders, { baseUrl }),
  };
}

export function isValidTimezone(value: string | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function resolveUserTimezone(ctx: Pick<MiraToolContext, 'timezone'>) {
  return isValidTimezone(ctx.timezone)
    ? { timezone: ctx.timezone, timezoneAssumed: false }
    : { timezone: 'UTC', timezoneAssumed: true };
}

/** Calendar date (YYYY-MM-DD) of an instant in the given timezone. */
export function toDateKey(instant: Date | string, tz: string) {
  return dayjs(instant).tz(tz).format('YYYY-MM-DD');
}

export function formatInTimezone(instant: Date | string, tz: string) {
  return dayjs(instant).tz(tz).format('YYYY-MM-DDTHH:mm:ssZ');
}

/** [start, end) of a calendar date in the given timezone, as UTC instants. */
export function getDayWindow(dateKey: string, tz: string) {
  const start = dayjs.tz(dateKey, tz).startOf('day');
  return { start: start.toDate(), end: start.add(1, 'day').toDate() };
}

export function isValidDateKey(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dayjs.utc(value).format('YYYY-MM-DD') === value
  );
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit) {
  if (from === to) return value;
  return from === 'kg' ? value / KG_PER_LB : value * KG_PER_LB;
}

export function isWithinBodyWeightBounds(value: number, unit: WeightUnit) {
  const kg = convertWeight(value, unit, 'kg');
  return kg >= BODY_WEIGHT_KG_BOUNDS.min && kg <= BODY_WEIGHT_KG_BOUNDS.max;
}

export function normalizeWeightUnit(value: unknown): WeightUnit | null {
  if (typeof value !== 'string') return null;
  const unit = value.trim().toLowerCase();
  if (unit === 'kg' || unit === 'kgs') return 'kg';
  if (unit === 'lb' || unit === 'lbs') return 'lb';
  return null;
}

export function getTrackerUnit(tracker: HabitTracker): string | null {
  const field = tracker.input_schema.find(
    (item) => item.key === tracker.primary_metric_key
  );
  return tracker.composer_config?.unit ?? field?.unit ?? null;
}

export function getEntryPrimaryValue(
  tracker: HabitTracker,
  entry: Pick<HabitTrackerEntry, 'primary_value' | 'values'>
) {
  if (typeof entry.primary_value === 'number') return entry.primary_value;
  const raw = entry.values?.[tracker.primary_metric_key];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  return null;
}

/** Aggregates one member's entries for a day using the tracker strategy. */
export function aggregateDayValue(
  tracker: HabitTracker,
  entries: Array<Pick<HabitTrackerEntry, 'primary_value' | 'values'>>
) {
  const values = entries
    .map((entry) => getEntryPrimaryValue(tracker, entry))
    .filter((value): value is number => value !== null);
  switch (tracker.aggregation_strategy) {
    case 'count_entries':
      return entries.length;
    case 'boolean_any':
      return values.some((value) => value > 0) ? 1 : 0;
    case 'max':
      return values.length ? Math.max(...values) : 0;
    default:
      return values.reduce((sum, value) => sum + value, 0);
  }
}

export function isTargetMet(tracker: HabitTracker, total: number) {
  return tracker.target_operator === 'eq'
    ? total === tracker.target_value
    : total >= tracker.target_value;
}

export type WeightPoint = { date: string; occurredAt: string; value: number };

export function summarizeWeights(points: WeightPoint[]) {
  if (points.length === 0) return null;
  const ordered = [...points].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
  );
  const first = ordered[0]!;
  const latest = ordered.at(-1)!;
  const values = ordered.map((point) => point.value);
  return {
    count: ordered.length,
    latest: { value: round2(latest.value), date: latest.date },
    earliest: { value: round2(first.value), date: first.date },
    change: round2(latest.value - first.value),
    min: round2(Math.min(...values)),
    max: round2(Math.max(...values)),
  };
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isNotFoundError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === 404
  );
}

/** Runs a habit API flow and turns thrown errors into a truthful failure. */
export function runHabitEffect<T>(task: () => Promise<T>, fallback: string) {
  return Effect.runPromise(
    Effect.tryPromise({
      try: task,
      catch: (error) => errorMessage(error, fallback),
    }).pipe(
      Effect.catchAll((error) =>
        Effect.succeed({ success: false as const, error })
      )
    )
  );
}

/** Execution options the AI SDK and the Live bridge pass to tool handlers. */
export type HabitToolOptions = { toolCallId?: string };

/**
 * Durable operation key for idempotent habit writes: the same scope and
 * normalized input always produce the same key, which the Tasks entries API
 * honours by returning the stored entry instead of writing again.
 */
export async function buildOperationKey(scope: string, parts: unknown[]) {
  const data = new TextEncoder().encode(JSON.stringify([scope, ...parts]));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `mira:${scope}:${hex.slice(0, 48)}`;
}

/** Key-sorted pairs so equivalent value objects hash identically. */
export function normalizeEntryValues(values: Record<string, unknown>) {
  return Object.keys(values)
    .sort()
    .map((key) => [key, values[key]]);
}

export type HabitLocale = 'en' | 'vi';

/**
 * Resolves the caller's language from the forwarded request: the web
 * `NEXT_LOCALE` preference cookie first, then `Accept-Language`, else English.
 */
export function resolveRequestLocale(
  headers: Pick<Headers, 'get'> | undefined
): HabitLocale {
  const cookie = headers?.get('cookie') ?? '';
  const preferred = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/
    .exec(cookie)?.[1]
    ?.trim()
    .toLowerCase();
  if (preferred === 'vi' || preferred === 'en') return preferred;
  for (const part of (headers?.get('accept-language') ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase();
    if (tag?.startsWith('vi')) return 'vi';
    if (tag?.startsWith('en')) return 'en';
  }
  return 'en';
}
