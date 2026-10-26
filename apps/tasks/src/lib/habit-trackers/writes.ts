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

// Opt-in key columns from migration 20261025125500. They are declared here as
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
    input_schema: payload.input_schema as unknown as NonNullable<Json>,
    quick_add_values: payload.quick_add_values as unknown as NonNullable<Json>,
    freeze_allowance: payload.freeze_allowance ?? 0,
    recovery_window_periods: payload.recovery_window_periods ?? 0,
    use_case: payload.use_case ?? 'generic',
    template_category: payload.template_category ?? 'custom',
    composer_mode: payload.composer_mode ?? 'advanced_custom',
    composer_config: (payload.composer_config ?? {}) as unknown as NonNullable<Json>,
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

type ReceiptOutcome = { entry_id: string | null; replayed: boolean };
// Typed locally: generated function types mark every argument non-null, but
// the function accepts NULL note and primary value, which this writer sends.
// It also keeps the writer compiling against declarations predating the
// migration, like the key columns above.
type ReceiptRpc = (
  fn: 'record_habit_tracker_entry_with_receipt',
  args: {
    p_ws_id: string;
    p_tracker_id: string;
    p_user_id: string;
    p_idempotency_key: string;
    p_request_hash: string;
    p_entry_kind: string;
    p_entry_date: string;
    p_occurred_at: string;
    p_values: Json;
    p_primary_value: number | null;
    p_note: string | null;
    p_tags: string[];
  }
) => PromiseLike<{ data: ReceiptOutcome[] | null; error: PostgrestError }>;

/**
 * The receipt function from migration 20261025125500. Until it reaches an
 * environment, PostgREST reports it missing and keyed writes fall back to the
 * unkeyed path instead of failing every request.
 */
const isMissingFunction = (error: PostgrestError) =>
  error?.code === 'PGRST202' || error?.code === '42883';

/** SHA-256 of the operation body, binding a receipt to what was requested. */
async function entryRequestHash(body: unknown) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(body))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function loadEntry(supabase: TypedSupabaseClient, entryId: string) {
  const { data, error } = await supabase
    .from('workspace_habit_tracker_entries')
    .select('*')
    .eq('id', entryId)
    .single();
  if (error || !data) {
    throw new HabitTrackerError('Failed to load habit tracker entry', 500);
  }
  return mapEntryRow(data as Record<string, unknown>);
}

/**
 * Creates an entry. With `idempotency_key`, the operation is accepted at most
 * once per tracker member: a database function claims an immutable receipt and
 * writes the entry in one transaction, so a retried older operation replays
 * (`replayed: true`) instead of overwriting a newer daily summary, and reusing
 * a key for a different request is rejected.
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
  const idempotencyKey = sanitized.entry.idempotency_key;
  const values = serializeEntryValues(sanitized.values);
  const note = sanitized.entry.note ?? null;
  const tags = sanitized.entry.tags ?? [];

  if (idempotencyKey) {
    // occurred_at only binds the receipt when the caller chose it; a default
    // of "now" would differ on every retry.
    const requestHash = await entryRequestHash([
      'habit-tracker-entry:v1',
      entryKind,
      sanitized.entry.entry_date,
      sanitized.entry.occurred_at ?? null,
      values,
      sanitized.primaryValue ?? null,
      note,
      tags,
    ]);
    const rpc = supabase.rpc.bind(supabase) as unknown as ReceiptRpc;
    const { data, error } = await rpc(
      'record_habit_tracker_entry_with_receipt',
      {
        p_ws_id: wsId,
        p_tracker_id: trackerId,
        p_user_id: actorUserId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_entry_kind: entryKind,
        p_entry_date: sanitized.entry.entry_date,
        p_occurred_at: sanitized.entry.occurred_at ?? new Date().toISOString(),
        p_values: values,
        p_primary_value: sanitized.primaryValue ?? null,
        p_note: note,
        p_tags: tags,
      }
    );
    if (!isMissingFunction(error)) {
      if (error?.code === 'P0409') {
        throw new HabitTrackerError(
          'This operation key was already used for a different entry',
          409
        );
      }
      if (error?.code === 'P0404') {
        throw new HabitTrackerError('Habit tracker not found', 404);
      }
      const outcome = data?.[0];
      if (error || !outcome) {
        throw new HabitTrackerError('Failed to save habit tracker entry', 500);
      }
      if (!outcome.entry_id) {
        // The operation was accepted earlier and its entry since deleted; a
        // late retry must not bring it back.
        throw new HabitTrackerError(
          'This operation was already applied and its entry has since been removed',
          409
        );
      }
      return {
        entry: await loadEntry(supabase, outcome.entry_id),
        replayed: outcome.replayed,
      };
    }
  }

  const occurredAt = sanitized.entry.occurred_at ?? new Date().toISOString();
  const fields = {
    values,
    primary_value: sanitized.primaryValue,
    note,
    tags,
    occurred_at: occurredAt,
  };

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

    const { data, error } = await supabase
      .from('workspace_habit_tracker_entries')
      .update(fields as EntryUpdate)
      .eq('id', existing.id)
      .select('*')
      .single();
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

  const row: EntryInsert = {
    ws_id: wsId,
    tracker_id: trackerId,
    user_id: actorUserId,
    entry_kind: entryKind,
    entry_date: sanitized.entry.entry_date,
    created_by: actorUserId,
    ...fields,
  };
  const { data, error } = await supabase
    .from('workspace_habit_tracker_entries')
    .insert(row)
    .select('*')
    .single();

  if (error && isUniqueViolation(error) && entryKind === 'daily_summary') {
    // A concurrent unkeyed write created the same daily summary day.
    const raced = await updateDailySummary();
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
