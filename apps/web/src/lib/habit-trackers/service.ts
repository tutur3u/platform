import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json, TablesInsert, TablesUpdate } from '@tuturuuu/types';
import type {
  HabitTracker,
  HabitTrackerCardSummary,
  HabitTrackerComposerConfig,
  HabitTrackerDetailResponse,
  HabitTrackerEntry,
  HabitTrackerEntryInput,
  HabitTrackerExerciseBlock,
  HabitTrackerFieldSchema,
  HabitTrackerInput,
  HabitTrackerMember,
  HabitTrackerStreakAction,
  HabitTrackerStreakActionInput,
} from '@tuturuuu/types/primitives/HabitTracker';
import {
  habitTrackerEntryInputSchema,
  habitTrackerInputSchema,
  habitTrackerUpdateSchema,
} from './schemas';
import {
  aggregateMetricsForTeam,
  buildHabitTrackerLeaderboard,
  buildHabitTrackerMemberSummary,
  buildHabitTrackerTeamSummary,
  computeHabitTrackerStreakSummary,
  getCurrentPeriodWindow,
  normalizeEntryKind,
} from './streaks';

export type HabitTrackerScope = 'self' | 'team' | 'member';

export interface HabitTrackerListResponse {
  trackers: HabitTrackerCardSummary[];
  members: HabitTrackerMember[];
  scope: HabitTrackerScope;
  scopeUserId: string | null;
  viewerUserId: string;
}

export class HabitTrackerError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HabitTrackerError';
    this.status = status;
  }
}

type HabitTrackerInsert = TablesInsert<'workspace_habit_trackers'>;
type HabitTrackerUpdate = TablesUpdate<'workspace_habit_trackers'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFieldSchema(input: unknown): HabitTrackerFieldSchema[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter(isRecord)
    .map((field) => ({
      key: typeof field.key === 'string' ? field.key : '',
      label: typeof field.label === 'string' ? field.label : '',
      type: ['boolean', 'number', 'duration', 'text', 'select'].includes(
        String(field.type)
      )
        ? (field.type as HabitTrackerFieldSchema['type'])
        : 'number',
      unit: typeof field.unit === 'string' ? field.unit : null,
      required: field.required === true,
      options: Array.isArray(field.options)
        ? field.options
            .filter(isRecord)
            .map((option) => ({
              label: typeof option.label === 'string' ? option.label : '',
              value: typeof option.value === 'string' ? option.value : '',
            }))
            .filter((option) => option.label && option.value)
        : undefined,
    }))
    .filter((field) => field.key && field.label);
}

function normalizeQuickAddValues(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function normalizeComposerConfig(
  input: unknown
): HabitTrackerComposerConfig | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    unit: typeof input.unit === 'string' ? input.unit : null,
    supported_units: Array.isArray(input.supported_units)
      ? input.supported_units.filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0
        )
      : undefined,
    suggested_increments: Array.isArray(input.suggested_increments)
      ? input.suggested_increments
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : undefined,
    progress_variant: ['ring', 'bar', 'check'].includes(
      String(input.progress_variant)
    )
      ? (input.progress_variant as HabitTrackerComposerConfig['progress_variant'])
      : undefined,
    suggested_exercises: Array.isArray(input.suggested_exercises)
      ? input.suggested_exercises.filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0
        )
      : undefined,
    default_sets:
      typeof input.default_sets === 'number' &&
      Number.isFinite(input.default_sets)
        ? input.default_sets
        : null,
    default_reps:
      typeof input.default_reps === 'number' &&
      Number.isFinite(input.default_reps)
        ? input.default_reps
        : null,
    default_weight_unit:
      typeof input.default_weight_unit === 'string'
        ? input.default_weight_unit
        : null,
  };
}

function normalizeExerciseBlocks(input: unknown): HabitTrackerExerciseBlock[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter(isRecord)
    .map((block) => ({
      exercise_name:
        typeof block.exercise_name === 'string'
          ? block.exercise_name.trim()
          : '',
      sets: Number(block.sets ?? 0),
      reps: Number(block.reps ?? 0),
      weight:
        typeof block.weight === 'number' && Number.isFinite(block.weight)
          ? block.weight
          : null,
      unit: typeof block.unit === 'string' ? block.unit : null,
      notes: typeof block.notes === 'string' ? block.notes : null,
    }))
    .filter(
      (block) =>
        block.exercise_name.length > 0 &&
        Number.isFinite(block.sets) &&
        block.sets > 0 &&
        Number.isFinite(block.reps) &&
        block.reps > 0
    );
}

function normalizeEntryValues(input: unknown): HabitTrackerEntry['values'] {
  if (!isRecord(input)) {
    return {};
  }

  const normalized: HabitTrackerEntry['values'] = {};

  for (const [key, value] of Object.entries(input)) {
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      normalized[key] = value;
      continue;
    }

    const exerciseBlocks = normalizeExerciseBlocks(value);
    if (exerciseBlocks.length > 0) {
      normalized[key] = exerciseBlocks;
    }
  }

  return normalized;
}

function serializeEntryValues(values: HabitTrackerEntry['values']): Json {
  return values as Json;
}

function mapTrackerRow(row: Record<string, unknown>): HabitTracker {
  return {
    id: String(row.id),
    ws_id: String(row.ws_id),
    name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    color: String(row.color).toUpperCase() as HabitTracker['color'],
    icon: typeof row.icon === 'string' ? row.icon : 'Repeat',
    tracking_mode:
      row.tracking_mode === 'daily_summary' ? 'daily_summary' : 'event_log',
    target_period: row.target_period === 'weekly' ? 'weekly' : 'daily',
    target_operator: row.target_operator === 'eq' ? 'eq' : 'gte',
    target_value: Number(row.target_value ?? 1),
    primary_metric_key:
      typeof row.primary_metric_key === 'string'
        ? row.primary_metric_key
        : 'value',
    aggregation_strategy: ['max', 'count_entries', 'boolean_any'].includes(
      String(row.aggregation_strategy)
    )
      ? (row.aggregation_strategy as HabitTracker['aggregation_strategy'])
      : 'sum',
    input_schema: normalizeFieldSchema(row.input_schema),
    quick_add_values: normalizeQuickAddValues(row.quick_add_values),
    freeze_allowance: Number(row.freeze_allowance ?? 0),
    recovery_window_periods: Number(row.recovery_window_periods ?? 0),
    use_case: [
      'body_weight',
      'counter',
      'measurement',
      'workout_session',
      'wellness_check',
    ].includes(String(row.use_case))
      ? (row.use_case as HabitTracker['use_case'])
      : 'generic',
    template_category: [
      'strength',
      'health',
      'recovery',
      'discipline',
    ].includes(String(row.template_category))
      ? (row.template_category as HabitTracker['template_category'])
      : 'custom',
    composer_mode: [
      'quick_check',
      'quick_increment',
      'measurement',
      'workout_session',
    ].includes(String(row.composer_mode))
      ? (row.composer_mode as HabitTracker['composer_mode'])
      : 'advanced_custom',
    composer_config: normalizeComposerConfig(row.composer_config),
    start_date:
      typeof row.start_date === 'string'
        ? row.start_date
        : new Date().toISOString().slice(0, 10),
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    is_active: row.is_active !== false,
    archived_at: typeof row.archived_at === 'string' ? row.archived_at : null,
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString(),
    updated_at:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : new Date().toISOString(),
  };
}

function mapEntryRow(row: Record<string, unknown>): HabitTrackerEntry {
  return {
    id: String(row.id),
    ws_id: String(row.ws_id),
    tracker_id: String(row.tracker_id),
    user_id: String(row.user_id),
    entry_kind:
      row.entry_kind === 'daily_summary' ? 'daily_summary' : 'event_log',
    entry_date:
      typeof row.entry_date === 'string'
        ? row.entry_date
        : new Date().toISOString().slice(0, 10),
    occurred_at:
      typeof row.occurred_at === 'string'
        ? row.occurred_at
        : new Date().toISOString(),
    values: normalizeEntryValues(row.values),
    primary_value:
      typeof row.primary_value === 'number' ? row.primary_value : null,
    note: typeof row.note === 'string' ? row.note : null,
    tags: Array.isArray(row.tags)
      ? row.tags.filter((value): value is string => typeof value === 'string')
      : [],
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString(),
    updated_at:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : new Date().toISOString(),
  };
}

function mapStreakActionRow(
  row: Record<string, unknown>
): HabitTrackerStreakAction {
  return {
    id: String(row.id),
    ws_id: String(row.ws_id),
    tracker_id: String(row.tracker_id),
    user_id: String(row.user_id),
    action_type: row.action_type === 'repair' ? 'repair' : 'freeze',
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    note: typeof row.note === 'string' ? row.note : null,
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString(),
    updated_at:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : new Date().toISOString(),
  };
}

function ensureTrackerSchema(input: HabitTrackerInput) {
  const uniqueKeys = new Set(input.input_schema.map((field) => field.key));

  if (uniqueKeys.size !== input.input_schema.length) {
    throw new HabitTrackerError('Tracker field keys must be unique');
  }

  if (!uniqueKeys.has(input.primary_metric_key)) {
    throw new HabitTrackerError(
      'Primary metric must match one of the tracker fields'
    );
  }
}

function sanitizeTrackerInput(input: HabitTrackerInput): HabitTrackerInput {
  const parsed = habitTrackerInputSchema.parse({
    ...input,
    quick_add_values: (input.quick_add_values ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
  });

  ensureTrackerSchema(parsed);

  return {
    ...parsed,
    quick_add_values: [...new Set(parsed.quick_add_values ?? [])].sort(
      (left, right) => left - right
    ),
    composer_config: normalizeComposerConfig(parsed.composer_config) ?? {},
  };
}

function sanitizeEntryValues(
  tracker: HabitTracker,
  input: HabitTrackerEntryInput
) {
  const parsed = habitTrackerEntryInputSchema.parse(input);
  const allowedFields = new Map(
    tracker.input_schema.map((field) => [field.key, field] as const)
  );
  const sanitizedValues: HabitTrackerEntry['values'] = {};

  for (const [key, rawValue] of Object.entries(parsed.values)) {
    if (key === 'exercise_blocks') {
      const exerciseBlocks = normalizeExerciseBlocks(rawValue);
      if (exerciseBlocks.length > 0) {
        sanitizedValues[key] = exerciseBlocks;
      }
      continue;
    }

    const field = allowedFields.get(key);
    if (!field) continue;

    if (rawValue === null) {
      sanitizedValues[key] = null;
      continue;
    }

    switch (field.type) {
      case 'boolean':
        sanitizedValues[key] = typeof rawValue === 'boolean' ? rawValue : false;
        break;
      case 'number':
      case 'duration':
        sanitizedValues[key] = typeof rawValue === 'number' ? rawValue : 0;
        break;
      case 'select':
        if (
          typeof rawValue === 'string' &&
          field.options?.some((option) => option.value === rawValue)
        ) {
          sanitizedValues[key] = rawValue;
        }
        break;
      default:
        if (typeof rawValue === 'string') {
          sanitizedValues[key] = rawValue;
        }
        break;
    }
  }

  if (tracker.use_case === 'workout_session') {
    const exerciseBlocks = normalizeExerciseBlocks(
      parsed.values.exercise_blocks
    );
    if (exerciseBlocks.length === 0) {
      throw new HabitTrackerError(
        'Workout session entries require at least one exercise block'
      );
    }

    const totalSets = exerciseBlocks.reduce(
      (sum, block) => sum + block.sets,
      0
    );
    const totalReps = exerciseBlocks.reduce(
      (sum, block) => sum + block.sets * block.reps,
      0
    );
    const totalVolume = exerciseBlocks.reduce(
      (sum, block) => sum + block.sets * block.reps * (block.weight ?? 0),
      0
    );

    sanitizedValues.exercise_blocks = exerciseBlocks;
    sanitizedValues.session_count = 1;
    sanitizedValues.total_sets = totalSets;
    sanitizedValues.total_reps = totalReps;
    sanitizedValues.total_volume = totalVolume;
  }

  for (const field of tracker.input_schema) {
    if (
      field.required &&
      (sanitizedValues[field.key] === undefined ||
        sanitizedValues[field.key] === '')
    ) {
      throw new HabitTrackerError(`Missing required field: ${field.label}`);
    }
  }

  const primaryValueCandidate =
    parsed.primary_value ?? sanitizedValues[tracker.primary_metric_key];

  return {
    entry: parsed,
    values: sanitizedValues,
    primaryValue:
      typeof primaryValueCandidate === 'number'
        ? primaryValueCandidate
        : typeof primaryValueCandidate === 'boolean'
          ? primaryValueCandidate
            ? 1
            : 0
          : null,
  };
}

export async function verifyWorkspaceMembership(
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new HabitTrackerError('Failed to verify workspace membership', 500);
  }

  if (!data) {
    throw new HabitTrackerError('Workspace access denied', 403);
  }

  return data;
}

export async function listHabitTrackerMembers(
  supabase: TypedSupabaseClient,
  wsId: string
) {
  const { data: links, error: linksError } = await supabase
    .from('workspace_user_linked_users')
    .select('platform_user_id, virtual_user_id')
    .eq('ws_id', wsId);

  if (linksError) {
    throw new HabitTrackerError('Failed to load workspace members', 500);
  }

  const virtualUserIds = [
    ...new Set((links ?? []).map((row) => row.virtual_user_id)),
  ];

  const { data: workspaceUsers, error: workspaceUsersError } = await supabase
    .from('workspace_users')
    .select('id, display_name, email, avatar_url')
    .eq('ws_id', wsId)
    .in(
      'id',
      virtualUserIds.length > 0
        ? virtualUserIds
        : ['00000000-0000-0000-0000-000000000000']
    );

  if (workspaceUsersError) {
    throw new HabitTrackerError('Failed to load workspace users', 500);
  }

  const workspaceUserById = new Map(
    (workspaceUsers ?? []).map((row) => [row.id, row] as const)
  );

  const members: HabitTrackerMember[] = [];

  for (const link of links ?? []) {
    const workspaceUser = workspaceUserById.get(link.virtual_user_id);

    if (!workspaceUser) {
      continue;
    }

    members.push({
      user_id: link.platform_user_id,
      workspace_user_id: workspaceUser.id,
      display_name:
        workspaceUser.display_name ||
        workspaceUser.email ||
        link.platform_user_id,
      email: workspaceUser.email,
      avatar_url: workspaceUser.avatar_url,
    });
  }

  return members.sort((left, right) =>
    left.display_name.localeCompare(right.display_name)
  );
}

export async function listHabitTrackers(
  supabase: TypedSupabaseClient,
  wsId: string
) {
  const { data, error } = await supabase
    .from('workspace_habit_trackers')
    .select('*')
    .eq('ws_id', wsId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new HabitTrackerError('Failed to load habit trackers', 500);
  }

  return (data ?? []).map((row) =>
    mapTrackerRow(row as Record<string, unknown>)
  );
}

async function listTrackerEntries(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerIds: string[]
) {
  if (trackerIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('workspace_habit_tracker_entries')
    .select('*')
    .eq('ws_id', wsId)
    .in('tracker_id', trackerIds)
    .order('entry_date', { ascending: false });

  if (error) {
    throw new HabitTrackerError('Failed to load habit tracker entries', 500);
  }

  return (data ?? []).map((row) => mapEntryRow(row as Record<string, unknown>));
}

async function listTrackerStreakActions(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerIds: string[]
) {
  if (trackerIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('workspace_habit_tracker_streak_actions')
    .select('*')
    .eq('ws_id', wsId)
    .in('tracker_id', trackerIds)
    .order('period_start', { ascending: false });

  if (error) {
    throw new HabitTrackerError(
      'Failed to load habit tracker streak actions',
      500
    );
  }

  return (data ?? []).map((row) =>
    mapStreakActionRow(row as Record<string, unknown>)
  );
}

function groupEntriesByUser(entries: HabitTrackerEntry[]) {
  const entriesByUser: Record<string, HabitTrackerEntry[]> = {};

  for (const entry of entries) {
    entriesByUser[entry.user_id] = [
      ...(entriesByUser[entry.user_id] ?? []),
      entry,
    ];
  }

  return entriesByUser;
}

function groupActionsByUser(actions: HabitTrackerStreakAction[]) {
  const actionsByUser: Record<string, HabitTrackerStreakAction[]> = {};

  for (const action of actions) {
    actionsByUser[action.user_id] = [
      ...(actionsByUser[action.user_id] ?? []),
      action,
    ];
  }

  return actionsByUser;
}

function resolveScopeUserId(
  members: HabitTrackerMember[],
  viewerId: string,
  scope: HabitTrackerScope,
  requestedUserId?: string | null
) {
  if (scope === 'team') {
    return null;
  }

  if (scope === 'member' && requestedUserId) {
    if (members.some((member) => member.user_id === requestedUserId)) {
      return requestedUserId;
    }
  }

  return viewerId;
}

function buildTrackerCardSummary(
  tracker: HabitTracker,
  members: HabitTrackerMember[],
  entries: HabitTrackerEntry[],
  actions: HabitTrackerStreakAction[],
  scope: HabitTrackerScope,
  scopeUserId: string | null
): HabitTrackerCardSummary {
  const entriesByUser = groupEntriesByUser(entries);
  const actionsByUser = groupActionsByUser(actions);
  const memberSummaries = members.map((member) =>
    buildHabitTrackerMemberSummary(
      tracker,
      member,
      entriesByUser[member.user_id] ?? [],
      actionsByUser[member.user_id] ?? []
    )
  );
  const leaderboard = buildHabitTrackerLeaderboard(memberSummaries).slice(0, 5);

  return {
    tracker,
    current_member:
      scope === 'team'
        ? undefined
        : memberSummaries.find(
            (summary) => summary.member.user_id === scopeUserId
          ),
    team: buildHabitTrackerTeamSummary(memberSummaries),
    leaderboard,
  };
}

export async function listHabitTrackerCards(
  supabase: TypedSupabaseClient,
  wsId: string,
  viewerId: string,
  scope: HabitTrackerScope,
  requestedUserId?: string | null
): Promise<HabitTrackerListResponse> {
  const [trackers, members] = await Promise.all([
    listHabitTrackers(supabase, wsId),
    listHabitTrackerMembers(supabase, wsId),
  ]);
  const scopeUserId = resolveScopeUserId(
    members,
    viewerId,
    scope,
    requestedUserId
  );
  const [entries, actions] = await Promise.all([
    listTrackerEntries(
      supabase,
      wsId,
      trackers.map((tracker) => tracker.id)
    ),
    listTrackerStreakActions(
      supabase,
      wsId,
      trackers.map((tracker) => tracker.id)
    ),
  ]);

  return {
    trackers: trackers.map((tracker) =>
      buildTrackerCardSummary(
        tracker,
        members,
        entries.filter((entry) => entry.tracker_id === tracker.id),
        actions.filter((action) => action.tracker_id === tracker.id),
        scope,
        scopeUserId
      )
    ),
    members,
    scope,
    scopeUserId,
    viewerUserId: viewerId,
  };
}

export async function getHabitTrackerDetail(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string,
  viewerId: string,
  scope: HabitTrackerScope,
  requestedUserId?: string | null
): Promise<HabitTrackerDetailResponse> {
  const [members, trackerResult, entries, actions] = await Promise.all([
    listHabitTrackerMembers(supabase, wsId),
    supabase
      .from('workspace_habit_trackers')
      .select('*')
      .eq('ws_id', wsId)
      .eq('id', trackerId)
      .is('archived_at', null)
      .maybeSingle(),
    listTrackerEntries(supabase, wsId, [trackerId]),
    listTrackerStreakActions(supabase, wsId, [trackerId]),
  ]);

  if (trackerResult.error) {
    throw new HabitTrackerError('Failed to load habit tracker', 500);
  }

  if (!trackerResult.data) {
    throw new HabitTrackerError('Habit tracker not found', 404);
  }

  const tracker = mapTrackerRow(trackerResult.data as Record<string, unknown>);
  const scopeUserId = resolveScopeUserId(
    members,
    viewerId,
    scope,
    requestedUserId
  );
  const entriesByUser = groupEntriesByUser(entries);
  const actionsByUser = groupActionsByUser(actions);
  const memberSummaries = members.map((member) =>
    buildHabitTrackerMemberSummary(
      tracker,
      member,
      entriesByUser[member.user_id] ?? [],
      actionsByUser[member.user_id] ?? []
    )
  );
  const leaderboard = buildHabitTrackerLeaderboard(memberSummaries);
  const currentMemberSummary = scopeUserId
    ? memberSummaries.find((summary) => summary.member.user_id === scopeUserId)
    : undefined;
  const recentEntries = [...entries]
    .sort(
      (left, right) =>
        new Date(right.occurred_at).getTime() -
        new Date(left.occurred_at).getTime()
    )
    .slice(0, 50)
    .map((entry) => ({
      ...entry,
      member:
        members.find((member) => member.user_id === entry.user_id) ?? null,
    }));

  return {
    tracker,
    entries: recentEntries,
    current_member: currentMemberSummary,
    team: buildHabitTrackerTeamSummary(memberSummaries),
    member_summaries: memberSummaries,
    leaderboard,
    current_period_metrics:
      scope === 'team'
        ? aggregateMetricsForTeam(tracker, entriesByUser, actionsByUser).slice(
            -12
          )
        : currentMemberSummary
          ? computeHabitTrackerStreakSummary(
              tracker,
              entriesByUser[currentMemberSummary.member.user_id] ?? [],
              actionsByUser[currentMemberSummary.member.user_id] ?? []
            ).metrics.slice(-12)
          : [],
  };
}

export async function createHabitTracker(
  supabase: TypedSupabaseClient,
  wsId: string,
  actorUserId: string,
  input: HabitTrackerInput
) {
  const payload = sanitizeTrackerInput(input);
  const insertPayload: HabitTrackerInsert = {
    name: payload.name,
    description: payload.description ?? null,
    color: payload.color,
    icon: payload.icon,
    tracking_mode: payload.tracking_mode,
    target_period: payload.target_period,
    target_operator: payload.target_operator,
    target_value: payload.target_value,
    primary_metric_key: payload.primary_metric_key,
    aggregation_strategy: payload.aggregation_strategy,
    input_schema: payload.input_schema as unknown as Json,
    quick_add_values: payload.quick_add_values as unknown as Json,
    freeze_allowance: payload.freeze_allowance ?? 0,
    recovery_window_periods: payload.recovery_window_periods ?? 0,
    use_case: payload.use_case ?? 'generic',
    template_category: payload.template_category ?? 'custom',
    composer_mode: payload.composer_mode ?? 'advanced_custom',
    composer_config: (payload.composer_config ?? {}) as unknown as Json,
    start_date: payload.start_date ?? new Date().toISOString().slice(0, 10),
    is_active: payload.is_active ?? true,
    ws_id: wsId,
    created_by: actorUserId,
  };
  const { data, error } = await supabase
    .from('workspace_habit_trackers')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    throw new HabitTrackerError('Failed to create habit tracker', 500);
  }

  return mapTrackerRow(data as Record<string, unknown>);
}

export async function updateHabitTracker(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string,
  input: Partial<HabitTrackerInput>
) {
  const { data: existing, error: existingError } = await supabase
    .from('workspace_habit_trackers')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', trackerId)
    .is('archived_at', null)
    .maybeSingle();

  if (existingError) {
    throw new HabitTrackerError('Failed to load habit tracker', 500);
  }

  if (!existing) {
    throw new HabitTrackerError('Habit tracker not found', 404);
  }

  const current = mapTrackerRow(existing as Record<string, unknown>);
  const parsed = habitTrackerUpdateSchema.parse(input);
  const payload = sanitizeTrackerInput({
    ...current,
    ...parsed,
    input_schema: parsed.input_schema ?? current.input_schema,
    quick_add_values: parsed.quick_add_values ?? current.quick_add_values,
  });
  const updatePayload: HabitTrackerUpdate = {
    name: payload.name,
    description: payload.description ?? null,
    color: payload.color,
    icon: payload.icon,
    tracking_mode: payload.tracking_mode,
    target_period: payload.target_period,
    target_operator: payload.target_operator,
    target_value: payload.target_value,
    primary_metric_key: payload.primary_metric_key,
    aggregation_strategy: payload.aggregation_strategy,
    input_schema: payload.input_schema as unknown as Json,
    quick_add_values: payload.quick_add_values as unknown as Json,
    freeze_allowance: payload.freeze_allowance ?? 0,
    recovery_window_periods: payload.recovery_window_periods ?? 0,
    use_case: payload.use_case ?? current.use_case ?? 'generic',
    template_category:
      payload.template_category ?? current.template_category ?? 'custom',
    composer_mode:
      payload.composer_mode ?? current.composer_mode ?? 'advanced_custom',
    composer_config: (payload.composer_config ??
      current.composer_config ??
      {}) as unknown as Json,
    start_date: payload.start_date ?? current.start_date,
    is_active: payload.is_active ?? true,
  };

  const { data, error } = await supabase
    .from('workspace_habit_trackers')
    .update(updatePayload)
    .eq('ws_id', wsId)
    .eq('id', trackerId)
    .select('*')
    .single();

  if (error) {
    throw new HabitTrackerError('Failed to update habit tracker', 500);
  }

  return mapTrackerRow(data as Record<string, unknown>);
}

export async function archiveHabitTracker(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string
) {
  const { error } = await supabase
    .from('workspace_habit_trackers')
    .update({
      archived_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('ws_id', wsId)
    .eq('id', trackerId)
    .is('archived_at', null);

  if (error) {
    throw new HabitTrackerError('Failed to archive habit tracker', 500);
  }
}

async function getTrackerOrThrow(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string
) {
  const { data, error } = await supabase
    .from('workspace_habit_trackers')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', trackerId)
    .is('archived_at', null)
    .maybeSingle();

  if (error) {
    throw new HabitTrackerError('Failed to load habit tracker', 500);
  }

  if (!data) {
    throw new HabitTrackerError('Habit tracker not found', 404);
  }

  return mapTrackerRow(data as Record<string, unknown>);
}

export async function createHabitTrackerEntry(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string,
  actorUserId: string,
  input: HabitTrackerEntryInput
) {
  const tracker = await getTrackerOrThrow(supabase, wsId, trackerId);
  const sanitized = sanitizeEntryValues(tracker, input);
  const entryKind = normalizeEntryKind(tracker.tracking_mode);

  if (entryKind === 'daily_summary') {
    const { data: existing, error: existingError } = await supabase
      .from('workspace_habit_tracker_entries')
      .select('*')
      .eq('ws_id', wsId)
      .eq('tracker_id', trackerId)
      .eq('user_id', actorUserId)
      .eq('entry_kind', 'daily_summary')
      .eq('entry_date', sanitized.entry.entry_date)
      .maybeSingle();

    if (existingError) {
      throw new HabitTrackerError('Failed to load habit tracker entry', 500);
    }

    if (existing) {
      const { data, error } = await supabase
        .from('workspace_habit_tracker_entries')
        .update({
          values: serializeEntryValues(sanitized.values),
          primary_value: sanitized.primaryValue,
          note: sanitized.entry.note ?? null,
          tags: sanitized.entry.tags ?? [],
          occurred_at: sanitized.entry.occurred_at ?? new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) {
        throw new HabitTrackerError(
          'Failed to update habit tracker entry',
          500
        );
      }

      return mapEntryRow(data as Record<string, unknown>);
    }
  }

  const { data, error } = await supabase
    .from('workspace_habit_tracker_entries')
    .insert({
      ws_id: wsId,
      tracker_id: trackerId,
      user_id: actorUserId,
      entry_kind: entryKind,
      entry_date: sanitized.entry.entry_date,
      occurred_at: sanitized.entry.occurred_at ?? new Date().toISOString(),
      values: serializeEntryValues(sanitized.values),
      primary_value: sanitized.primaryValue,
      note: sanitized.entry.note ?? null,
      tags: sanitized.entry.tags ?? [],
      created_by: actorUserId,
    })
    .select('*')
    .single();

  if (error) {
    throw new HabitTrackerError('Failed to create habit tracker entry', 500);
  }

  return mapEntryRow(data as Record<string, unknown>);
}

export async function updateHabitTrackerEntry(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string,
  entryId: string,
  actorUserId: string,
  input: Partial<HabitTrackerEntryInput>
) {
  const tracker = await getTrackerOrThrow(supabase, wsId, trackerId);
  const { data: existing, error: existingError } = await supabase
    .from('workspace_habit_tracker_entries')
    .select('*')
    .eq('ws_id', wsId)
    .eq('tracker_id', trackerId)
    .eq('id', entryId)
    .eq('user_id', actorUserId)
    .maybeSingle();

  if (existingError) {
    throw new HabitTrackerError('Failed to load habit tracker entry', 500);
  }

  if (!existing) {
    throw new HabitTrackerError('Habit tracker entry not found', 404);
  }

  const currentEntry = mapEntryRow(existing as Record<string, unknown>);
  const sanitized = sanitizeEntryValues(tracker, {
    ...currentEntry,
    ...input,
    entry_date: input.entry_date ?? currentEntry.entry_date,
    values: input.values ?? currentEntry.values,
    tags: input.tags ?? currentEntry.tags,
  });

  const { data, error } = await supabase
    .from('workspace_habit_tracker_entries')
    .update({
      entry_date: sanitized.entry.entry_date,
      occurred_at: sanitized.entry.occurred_at ?? currentEntry.occurred_at,
      values: serializeEntryValues(sanitized.values),
      primary_value: sanitized.primaryValue,
      note: sanitized.entry.note ?? null,
      tags: sanitized.entry.tags ?? [],
    })
    .eq('id', entryId)
    .select('*')
    .single();

  if (error) {
    throw new HabitTrackerError('Failed to update habit tracker entry', 500);
  }

  return mapEntryRow(data as Record<string, unknown>);
}

export async function deleteHabitTrackerEntry(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string,
  entryId: string,
  actorUserId: string
) {
  const { error } = await supabase
    .from('workspace_habit_tracker_entries')
    .delete()
    .eq('ws_id', wsId)
    .eq('tracker_id', trackerId)
    .eq('id', entryId)
    .eq('user_id', actorUserId);

  if (error) {
    throw new HabitTrackerError('Failed to delete habit tracker entry', 500);
  }
}

export async function applyHabitTrackerStreakAction(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string,
  actorUserId: string,
  input: HabitTrackerStreakActionInput
) {
  const tracker = await getTrackerOrThrow(supabase, wsId, trackerId);
  const currentPeriod = getCurrentPeriodWindow(tracker.target_period);
  const parsed = {
    action_type: input.action_type,
    period_start: input.period_start,
    note: input.note ?? null,
  };

  if (parsed.period_start >= currentPeriod.period_start) {
    throw new HabitTrackerError(
      'Streak actions can only target completed periods'
    );
  }

  const [entries, actions] = await Promise.all([
    listTrackerEntries(supabase, wsId, [trackerId]),
    listTrackerStreakActions(supabase, wsId, [trackerId]),
  ]);
  const currentEntries = entries.filter(
    (entry) => entry.user_id === actorUserId
  );
  const currentActions = actions.filter(
    (action) => action.user_id === actorUserId
  );
  const summary = computeHabitTrackerStreakSummary(
    tracker,
    currentEntries,
    currentActions
  );
  const targetMetric = summary.metrics.find(
    (metric) => metric.period_start === parsed.period_start
  );

  if (!targetMetric) {
    throw new HabitTrackerError('Selected streak period was not found');
  }

  if (
    targetMetric.success ||
    targetMetric.used_freeze ||
    targetMetric.used_repair
  ) {
    throw new HabitTrackerError('Selected streak period is already satisfied');
  }

  if (
    parsed.action_type === 'freeze' &&
    summary.streak.freezes_used >= summary.streak.freeze_count
  ) {
    throw new HabitTrackerError('No freezes remaining for this tracker');
  }

  if (
    parsed.action_type === 'repair' &&
    summary.streak.recovery_window.period_start !== parsed.period_start
  ) {
    throw new HabitTrackerError('This period is no longer eligible for repair');
  }

  const { data, error } = await supabase
    .from('workspace_habit_tracker_streak_actions')
    .insert({
      ws_id: wsId,
      tracker_id: trackerId,
      user_id: actorUserId,
      action_type: parsed.action_type,
      period_start: parsed.period_start,
      period_end: targetMetric.period_end,
      note: parsed.note,
      created_by: actorUserId,
    })
    .select('*')
    .single();

  if (error) {
    throw new HabitTrackerError('Failed to save streak action', 500);
  }

  return mapStreakActionRow(data as Record<string, unknown>);
}
