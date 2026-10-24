import {
  createWorkspaceHabitTrackerEntry,
  listWorkspaceHabitTrackers,
} from '@tuturuuu/internal-api';
import type { HabitTrackerEntryValue } from '@tuturuuu/types/primitives/HabitTracker';
import { z } from 'zod';
import type { MiraToolContext } from '../mira-tool-types';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';
import {
  getTrackerUnit,
  isTargetMet,
  resolveHabitApi,
  resolveUserTimezone,
  runHabitEffect,
  toDateKey,
} from './habit-helpers';

export {
  executeGetBodyWeightHistory,
  executeLogBodyWeight,
} from './body-weight';

const MAX_LISTED_TRACKERS = 30;

const logEntryArgsSchema = z
  .object({
    trackerId: z.guid(),
    value: z.union([z.number(), z.boolean()]).optional(),
    values: z
      .record(
        z.string().regex(/^[a-z0-9_]+$/),
        z.union([z.number(), z.boolean(), z.string().max(500), z.null()])
      )
      .optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.value !== undefined || data.values);

export async function executeListHabitTrackers(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const api = resolveHabitApi(ctx);
  if (!api.ok) return api.result;
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  return runHabitEffect(async () => {
    const { trackers } = await listWorkspaceHabitTrackers(
      wsId,
      { scope: 'self' },
      api.options
    );
    const active = trackers.filter(
      ({ tracker }) => tracker.is_active !== false && !tracker.archived_at
    );
    return {
      success: true,
      workspaceId: wsId,
      count: active.length,
      ...(active.length > MAX_LISTED_TRACKERS ? { truncated: true } : {}),
      trackers: active
        .slice(0, MAX_LISTED_TRACKERS)
        .map(({ tracker, current_member }) => {
          const total = current_member?.current_period_total ?? 0;
          return {
            id: tracker.id,
            name: tracker.name,
            useCase: tracker.use_case ?? 'generic',
            trackingMode: tracker.tracking_mode,
            primaryMetric: tracker.primary_metric_key,
            unit: getTrackerUnit(tracker),
            target: {
              period: tracker.target_period,
              operator: tracker.target_operator,
              value: tracker.target_value,
            },
            currentPeriod: {
              total,
              met: isTargetMet(tracker, total),
            },
            currentStreak: current_member?.streak.current_streak ?? 0,
            latestValue: current_member?.latest_value ?? null,
            latestEntryDate: current_member?.latest_entry_date ?? null,
          };
        }),
    };
  }, 'Habit trackers are unavailable.');
}

export async function executeLogHabitEntry(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = logEntryArgsSchema.safeParse(args);
  if (!parsed.success)
    return {
      success: false,
      error: 'Provide trackerId and either value or values.',
    };
  const api = resolveHabitApi(ctx);
  if (!api.ok) return api.result;
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  const { timezone, timezoneAssumed } = resolveUserTimezone(ctx);
  const { trackerId, value, values, note } = parsed.data;
  const occurredAt = parsed.data.occurredAt
    ? new Date(parsed.data.occurredAt)
    : new Date();

  return runHabitEffect(async () => {
    let entryValues: Record<string, HabitTrackerEntryValue> = {
      ...(values ?? {}),
    };
    let trackerName: string | undefined;
    if (value !== undefined) {
      const { trackers } = await listWorkspaceHabitTrackers(
        wsId,
        { scope: 'self' },
        api.options
      );
      const tracker = trackers.find(
        (card) => card.tracker.id === trackerId
      )?.tracker;
      if (!tracker)
        return {
          success: false,
          error: 'Habit tracker not found in the current workspace.',
        };
      trackerName = tracker.name;
      entryValues = { ...entryValues, [tracker.primary_metric_key]: value };
    }
    const entry = await createWorkspaceHabitTrackerEntry(
      wsId,
      trackerId,
      {
        entry_date: toDateKey(occurredAt, timezone),
        occurred_at: occurredAt.toISOString(),
        values: entryValues,
        ...(note ? { note } : {}),
      },
      api.options
    );
    return {
      success: true,
      workspaceId: wsId,
      tracker: { id: trackerId, ...(trackerName ? { name: trackerName } : {}) },
      entry: {
        id: entry.id,
        date: entry.entry_date,
        primaryValue: entry.primary_value ?? null,
        values: entry.values,
      },
      timezone,
      ...(timezoneAssumed ? { timezoneAssumed: true } : {}),
    };
  }, 'Habit entry could not be logged.');
}
