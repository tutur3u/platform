import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json, TablesInsert, TablesUpdate } from '@tuturuuu/types';
import type {
  HabitTracker,
  HabitTrackerEntry,
  HabitTrackerEntryInput,
  HabitTrackerInput,
} from '@tuturuuu/types/primitives/HabitTracker';
import {
  getTrackerOrThrow,
  HabitTrackerError,
  mapEntryRow,
  mapTrackerRow,
  sanitizeEntryValues,
  sanitizeTrackerInput,
  serializeEntryValues,
} from './service';
import { normalizeEntryKind } from './streaks';

type TrackerInsert = TablesInsert<'workspace_habit_trackers'>;
type EntryInsert = TablesInsert<'workspace_habit_tracker_entries'>;
type EntryUpdate = TablesUpdate<'workspace_habit_tracker_entries'>;

// Opt-in key columns from migration 20261025034500. They are declared here as
// well as in the generated types so the writers also compile in checkouts whose
// generated declarations predate the migration.
type KeyedTrackerInput = HabitTrackerInput & { creation_key?: string };
type KeyedEntryInput = HabitTrackerEntryInput & { idempotency_key?: string };
type PostgrestError = { code?: string } | null;
type KeyedLookup<T> = { row: T | null; columnMissing: boolean };

const isUniqueViolation = (error: PostgrestError) => error?.code === '23505';

/**
 * Until the idempotency migration reaches an environment, the key columns do
 * not exist. Keyed writes then fall back to the previous behaviour instead of
 * failing every request.
 */
const isMissingKeyColumn = (error: PostgrestError) =>
  error?.code === '42703' || error?.code === 'PGRST204';

async function findTrackerByCreationKey(
  supabase: TypedSupabaseClient,
  wsId: string,
  actorUserId: string,
  creationKey: string
): Promise<KeyedLookup<HabitTracker>> {
  const { data, error } = await supabase
    .from('workspace_habit_trackers')
    .select('*')
    .eq('ws_id', wsId)
    .eq('created_by', actorUserId)
    .filter('creation_key', 'eq', creationKey)
    .eq('is_active', true)
    .is('archived_at', null)
    .maybeSingle();
  if (isMissingKeyColumn(error)) return { row: null, columnMissing: true };
  if (error) throw new HabitTrackerError('Failed to load habit tracker', 500);
  return {
    row: data ? mapTrackerRow(data as Record<string, unknown>) : null,
    columnMissing: false,
  };
}

/**
 * Creates a tracker. With `creation_key`, at most one active tracker exists per
 * workspace creator and key; a repeat or a lost race returns that tracker.
 */
export async function createHabitTracker(
  supabase: TypedSupabaseClient,
  wsId: string,
  actorUserId: string,
  input: KeyedTrackerInput
): Promise<{ tracker: HabitTracker; created: boolean }> {
  const payload: KeyedTrackerInput = sanitizeTrackerInput(input);
  let creationKey = payload.creation_key;
  if (creationKey) {
    const existing = await findTrackerByCreationKey(
      supabase,
      wsId,
      actorUserId,
      creationKey
    );
    if (existing.row) return { tracker: existing.row, created: false };
    if (existing.columnMissing) creationKey = undefined;
  }
  const insertPayload: TrackerInsert & { creation_key?: string } = {
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
    ...(creationKey ? { creation_key: creationKey } : {}),
  };
  const { data, error } = await supabase
    .from('workspace_habit_trackers')
    .insert(insertPayload as TrackerInsert)
    .select('*')
    .single();

  if (error && creationKey && isUniqueViolation(error)) {
    const winner = await findTrackerByCreationKey(
      supabase,
      wsId,
      actorUserId,
      creationKey
    );
    if (winner.row) return { tracker: winner.row, created: false };
  }
  if (error) {
    throw new HabitTrackerError('Failed to create habit tracker', 500);
  }

  return {
    tracker: mapTrackerRow(data as Record<string, unknown>),
    created: true,
  };
}

async function findEntryByKey(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string,
  actorUserId: string,
  idempotencyKey: string
): Promise<KeyedLookup<HabitTrackerEntry>> {
  const { data, error } = await supabase
    .from('workspace_habit_tracker_entries')
    .select('*')
    .eq('ws_id', wsId)
    .eq('tracker_id', trackerId)
    .eq('user_id', actorUserId)
    .filter('idempotency_key', 'eq', idempotencyKey)
    .maybeSingle();
  if (isMissingKeyColumn(error)) return { row: null, columnMissing: true };
  if (error) {
    throw new HabitTrackerError('Failed to load habit tracker entry', 500);
  }
  return {
    row: data ? mapEntryRow(data as Record<string, unknown>) : null,
    columnMissing: false,
  };
}

/**
 * Creates an entry. With `idempotency_key`, a repeated operation for the same
 * tracker member returns the stored entry (`replayed: true`) without writing.
 */
export async function createHabitTrackerEntry(
  supabase: TypedSupabaseClient,
  wsId: string,
  trackerId: string,
  actorUserId: string,
  input: KeyedEntryInput
): Promise<{ entry: HabitTrackerEntry; replayed: boolean }> {
  const tracker = await getTrackerOrThrow(supabase, wsId, trackerId);
  const sanitized = sanitizeEntryValues(tracker, input);
  const entryKind = normalizeEntryKind(tracker.tracking_mode);
  let idempotencyKey = sanitized.entry.idempotency_key;
  const replay = async () => {
    if (!idempotencyKey) return null;
    const found = await findEntryByKey(
      supabase,
      wsId,
      trackerId,
      actorUserId,
      idempotencyKey
    );
    if (found.columnMissing) idempotencyKey = undefined;
    return found.row ? { entry: found.row, replayed: true } : null;
  };

  const earlier = await replay();
  if (earlier) return earlier;
  const keyFields = idempotencyKey ? { idempotency_key: idempotencyKey } : {};
  const occurredAt = sanitized.entry.occurred_at ?? new Date().toISOString();

  const updateDailySummary = async () => {
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
    if (!existing) return null;

    const changes: EntryUpdate & { idempotency_key?: string } = {
      values: serializeEntryValues(sanitized.values),
      primary_value: sanitized.primaryValue,
      note: sanitized.entry.note ?? null,
      tags: sanitized.entry.tags ?? [],
      occurred_at: occurredAt,
      ...keyFields,
    };
    const { data, error } = await supabase
      .from('workspace_habit_tracker_entries')
      .update(changes as EntryUpdate)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error && isUniqueViolation(error)) {
      const raced = await replay();
      if (raced) return raced;
    }
    if (error) {
      throw new HabitTrackerError('Failed to update habit tracker entry', 500);
    }
    return {
      entry: mapEntryRow(data as Record<string, unknown>),
      replayed: false,
    };
  };

  if (entryKind === 'daily_summary') {
    const updated = await updateDailySummary();
    if (updated) return updated;
  }

  const row: EntryInsert & { idempotency_key?: string } = {
    ws_id: wsId,
    tracker_id: trackerId,
    user_id: actorUserId,
    entry_kind: entryKind,
    entry_date: sanitized.entry.entry_date,
    occurred_at: occurredAt,
    values: serializeEntryValues(sanitized.values),
    primary_value: sanitized.primaryValue,
    note: sanitized.entry.note ?? null,
    tags: sanitized.entry.tags ?? [],
    created_by: actorUserId,
    ...keyFields,
  };
  const { data, error } = await supabase
    .from('workspace_habit_tracker_entries')
    .insert(row as EntryInsert)
    .select('*')
    .single();

  if (error && isUniqueViolation(error)) {
    // A concurrent request with the same key, or the same daily summary day.
    const raced =
      (await replay()) ??
      (entryKind === 'daily_summary' ? await updateDailySummary() : null);
    if (raced) return raced;
  }
  if (error) {
    throw new HabitTrackerError('Failed to create habit tracker entry', 500);
  }

  return {
    entry: mapEntryRow(data as Record<string, unknown>),
    replayed: false,
  };
}
