import {
  createWorkspaceHabitTracker,
  createWorkspaceHabitTrackerEntry,
  listWorkspaceHabitTrackerEntries,
  listWorkspaceHabitTrackers,
} from '@tuturuuu/internal-api';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import type {
  HabitTracker,
  HabitTrackerInput,
} from '@tuturuuu/types/primitives/HabitTracker';
import dayjs from 'dayjs';
import { z } from 'zod';
import type { MiraToolContext } from '../mira-tool-types';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';
import {
  BODY_WEIGHT_KG_BOUNDS,
  convertWeight,
  errorMessage,
  getEntryPrimaryValue,
  getTrackerUnit,
  isNotFoundError,
  isWithinBodyWeightBounds,
  normalizeWeightUnit,
  resolveHabitApi,
  resolveUserTimezone,
  round2,
  runHabitEffect,
  summarizeWeights,
  toDateKey,
  type WeightUnit,
} from './habit-helpers';

/** Tasks returns at most this many recent entries per tracker. */
const ENTRY_PAGE_LIMIT = 50;

const logArgsSchema = z.object({
  value: z.number().positive().max(1500),
  unit: z.enum(['kg', 'lb']).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  note: z.string().trim().max(500).optional(),
});
const historyArgsSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});

type ResolvedTracker = {
  tracker: HabitTracker;
  workspaceId: string;
  personal: boolean;
  isCurrentWorkspace: boolean;
  created: boolean;
};

/**
 * Mirrors the Tasks `body_weight` template. The Tasks satellite sanitises and
 * validates the payload, so this stays minimal.
 */
export function buildBodyWeightTrackerInput(
  unit: WeightUnit
): HabitTrackerInput {
  return {
    name: 'Body Weight',
    description:
      'Log body weight with per-tracker units and a clean daily check-in.',
    color: 'INDIGO',
    icon: 'SlidersHorizontal',
    tracking_mode: 'daily_summary',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: unit === 'lb' ? 154 : 70,
    primary_metric_key: 'weight',
    aggregation_strategy: 'max',
    quick_add_values: [],
    input_schema: [
      {
        key: 'weight',
        label: 'Body Weight',
        type: 'number',
        unit,
        required: true,
      },
      { key: 'note', label: 'Note', type: 'text' },
    ],
    freeze_allowance: 1,
    recovery_window_periods: 1,
    use_case: 'body_weight',
    template_category: 'health',
    composer_mode: 'measurement',
    composer_config: {
      unit,
      supported_units: ['kg', 'lb'],
      progress_variant: 'ring',
    },
  };
}

async function findBodyWeightTracker(
  wsId: string,
  options: InternalApiClientOptions
) {
  try {
    const { trackers } = await listWorkspaceHabitTrackers(
      wsId,
      { scope: 'self' },
      options
    );
    return (
      trackers
        .map((card) => card.tracker)
        .find(
          (tracker) =>
            tracker.use_case === 'body_weight' &&
            tracker.is_active !== false &&
            !tracker.archived_at
        ) ?? null
    );
  } catch (error) {
    // Habits disabled or not visible in this workspace.
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function resolvePersonalWorkspaceId(ctx: MiraToolContext) {
  if (ctx.workspaceContext?.personal === true)
    return getWorkspaceContextWorkspaceId(ctx);
  const { data, error } = await ctx.supabase
    .from('workspaces')
    .select('id, workspace_members!inner(user_id)')
    .eq('personal', true)
    .eq('workspace_members.user_id', ctx.userId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { id?: string } | null)?.id ?? null;
}

type MissingTracker = {
  missing: true;
  personalWsId: string | null;
  currentIsPersonal: boolean;
};

/**
 * Habit trackers and their entries are visible to every member of their
 * workspace. An existing body weight tracker in the current workspace is the
 * user's own choice; otherwise look in the personal workspace.
 */
export async function findBodyWeightTrackerForUser(
  ctx: MiraToolContext,
  options: InternalApiClientOptions
): Promise<ResolvedTracker | MissingTracker> {
  const currentWsId = getWorkspaceContextWorkspaceId(ctx);
  const personalWsId = await resolvePersonalWorkspaceId(ctx);
  const currentIsPersonal = personalWsId === currentWsId;

  const current = await findBodyWeightTracker(currentWsId, options);
  if (current)
    return {
      tracker: current,
      workspaceId: currentWsId,
      personal: currentIsPersonal,
      isCurrentWorkspace: true,
      created: false,
    };

  if (personalWsId && !currentIsPersonal) {
    const personal = await findBodyWeightTracker(personalWsId, options);
    if (personal)
      return {
        tracker: personal,
        workspaceId: personalWsId,
        personal: true,
        isCurrentWorkspace: false,
        created: false,
      };
  }
  return { missing: true, personalWsId, currentIsPersonal };
}

/**
 * The only code path that creates a tracker for Mira. It creates a private
 * Body Weight tracker in the personal workspace, never in a shared one.
 */
export async function createPrivateBodyWeightTracker(
  missing: MissingTracker,
  unit: WeightUnit,
  options: InternalApiClientOptions
): Promise<ResolvedTracker | { error: string }> {
  if (!missing.personalWsId)
    return {
      error:
        'No personal workspace was found, so no private Body Weight tracker could be created. Nothing was logged.',
    };
  const tracker = await createWorkspaceHabitTracker(
    missing.personalWsId,
    buildBodyWeightTrackerInput(unit),
    options
  );
  return {
    tracker,
    workspaceId: missing.personalWsId,
    personal: true,
    isCurrentWorkspace: missing.currentIsPersonal,
    created: true,
  };
}

function describeWorkspace(resolved: ResolvedTracker) {
  return {
    id: resolved.workspaceId,
    personal: resolved.personal,
    isCurrentWorkspace: resolved.isCurrentWorkspace,
  };
}

export async function executeLogBodyWeight(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = logArgsSchema.safeParse(args);
  if (!parsed.success)
    return { success: false, error: 'Invalid body weight input.' };
  const api = resolveHabitApi(ctx);
  if (!api.ok) return api.result;
  const { value, unit: inputUnit, note } = parsed.data;
  const outOfBounds = {
    success: false as const,
    error: `Body weight must be between ${BODY_WEIGHT_KG_BOUNDS.min} and ${BODY_WEIGHT_KG_BOUNDS.max} kg. Nothing was logged.`,
  };
  if (inputUnit && !isWithinBodyWeightBounds(value, inputUnit))
    return outOfBounds;
  const { timezone, timezoneAssumed } = resolveUserTimezone(ctx);
  const occurredAt = parsed.data.occurredAt
    ? new Date(parsed.data.occurredAt)
    : new Date();

  return runHabitEffect(async () => {
    const found = await findBodyWeightTrackerForUser(ctx, api.options);
    let resolved: ResolvedTracker;
    if ('missing' in found) {
      const createUnit = inputUnit ?? 'kg';
      if (!isWithinBodyWeightBounds(value, createUnit)) return outOfBounds;
      const created = await createPrivateBodyWeightTracker(
        found,
        createUnit,
        api.options
      );
      if ('error' in created) return { success: false, error: created.error };
      resolved = created;
    } else resolved = found;
    const rawTrackerUnit = getTrackerUnit(resolved.tracker);
    const trackerUnit = rawTrackerUnit
      ? normalizeWeightUnit(rawTrackerUnit)
      : 'kg';
    if (!trackerUnit)
      return {
        success: false,
        error: `The Body Weight tracker uses "${rawTrackerUnit}", which Mira cannot convert. Log this entry in Tasks. Nothing was logged.`,
      };
    const unit = inputUnit ?? trackerUnit;
    if (!isWithinBodyWeightBounds(value, unit))
      return { ...outOfBounds, trackerCreated: resolved.created };
    const storedUnit = trackerUnit;
    const storedValue = round2(convertWeight(value, unit, storedUnit));
    let entry: Awaited<ReturnType<typeof createWorkspaceHabitTrackerEntry>>;
    try {
      entry = await createWorkspaceHabitTrackerEntry(
        resolved.workspaceId,
        resolved.tracker.id,
        {
          entry_date: toDateKey(occurredAt, timezone),
          occurred_at: occurredAt.toISOString(),
          values: { [resolved.tracker.primary_metric_key]: storedValue },
          ...(note ? { note } : {}),
        },
        api.options
      );
    } catch (error) {
      // Keep the creation visible so Mira can still tell the user about it.
      return {
        success: false,
        trackerCreated: resolved.created,
        workspace: describeWorkspace(resolved),
        error: errorMessage(error, 'Body weight could not be logged.'),
      };
    }
    return {
      success: true,
      trackerCreated: resolved.created,
      tracker: {
        id: resolved.tracker.id,
        name: resolved.tracker.name,
        unit: storedUnit,
      },
      workspace: describeWorkspace(resolved),
      entry: {
        id: entry.id,
        date: entry.entry_date,
        value: storedValue,
        unit: storedUnit,
      },
      ...(storedUnit !== unit ? { convertedFrom: { value, unit } } : {}),
      timezone,
      ...(timezoneAssumed ? { timezoneAssumed: true } : {}),
    };
  }, 'Body weight could not be logged.');
}

export async function executeGetBodyWeightHistory(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = historyArgsSchema.safeParse(args);
  if (!parsed.success)
    return { success: false, error: 'days must be between 1 and 365.' };
  const api = resolveHabitApi(ctx);
  if (!api.ok) return api.result;
  const days = parsed.data.days ?? 30;
  const { timezone, timezoneAssumed } = resolveUserTimezone(ctx);
  const todayKey = toDateKey(new Date(), timezone);
  const startKey = dayjs
    .utc(todayKey)
    .subtract(days - 1, 'day')
    .format('YYYY-MM-DD');

  return runHabitEffect(async () => {
    const resolved = await findBodyWeightTrackerForUser(ctx, api.options);
    if ('missing' in resolved)
      return {
        success: true,
        tracker: null,
        entries: [],
        summary: null,
        message: 'No body weight tracker exists yet.',
      };
    const unit = getTrackerUnit(resolved.tracker) ?? 'kg';
    const raw = await listWorkspaceHabitTrackerEntries(
      resolved.workspaceId,
      resolved.tracker.id,
      api.options
    );
    const entries = raw
      .filter(
        (entry) =>
          entry.user_id === ctx.userId &&
          entry.entry_date >= startKey &&
          entry.entry_date <= todayKey
      )
      .map((entry) => ({
        id: entry.id,
        date: entry.entry_date,
        occurredAt: entry.occurred_at,
        value: getEntryPrimaryValue(resolved.tracker, entry),
        note: entry.note ?? null,
      }))
      .filter(
        (entry): entry is typeof entry & { value: number } =>
          entry.value !== null
      )
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    const oldestRaw = raw.reduce<string | null>(
      (oldest, entry) =>
        !oldest || entry.entry_date < oldest ? entry.entry_date : oldest,
      null
    );
    return {
      success: true,
      tracker: { id: resolved.tracker.id, name: resolved.tracker.name, unit },
      workspace: describeWorkspace(resolved),
      period: { days, from: startKey, to: todayKey },
      entries: entries.map((entry) => ({
        ...entry,
        value: round2(entry.value),
      })),
      summary: summarizeWeights(entries),
      ...(raw.length >= ENTRY_PAGE_LIMIT && oldestRaw && oldestRaw > startKey
        ? { mayBeIncomplete: true }
        : {}),
      timezone,
      ...(timezoneAssumed ? { timezoneAssumed: true } : {}),
    };
  }, 'Body weight history is unavailable.');
}
