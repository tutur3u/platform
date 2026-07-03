import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type HabitSkipRow = {
  id: string;
  ws_id: string;
  habit_id: string;
  occurrence_date: string;
  created_by: string | null;
  source_event_id: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

export interface HabitSkipInput {
  wsId: string;
  habitId: string;
  occurrenceDate: string;
  createdBy?: string | null;
  sourceEventId?: string | null;
}

export async function upsertHabitSkip(
  supabase: TypedSupabaseClient,
  input: HabitSkipInput
) {
  const { data, error } = await supabase
    .from('habit_skipped_occurrences')
    .upsert(
      {
        ws_id: input.wsId,
        habit_id: input.habitId,
        occurrence_date: input.occurrenceDate,
        created_by: input.createdBy ?? null,
        source_event_id: input.sourceEventId ?? null,
        revoked_at: null,
      },
      {
        onConflict: 'ws_id,habit_id,occurrence_date',
      }
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as HabitSkipRow;
}

export async function revokeHabitSkip(
  supabase: TypedSupabaseClient,
  wsId: string,
  habitId: string,
  occurrenceDate: string
) {
  const { data, error } = await supabase
    .from('habit_skipped_occurrences')
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq('ws_id', wsId)
    .eq('habit_id', habitId)
    .eq('occurrence_date', occurrenceDate)
    .is('revoked_at', null)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as HabitSkipRow | null) ?? null;
}

export async function listActiveHabitSkipDates(
  supabase: TypedSupabaseClient,
  wsId: string,
  habitIds: string[],
  rangeStart: string,
  rangeEnd: string
) {
  if (habitIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('habit_skipped_occurrences')
    .select('habit_id, occurrence_date')
    .eq('ws_id', wsId)
    .in('habit_id', habitIds)
    .gte('occurrence_date', rangeStart)
    .lte('occurrence_date', rangeEnd)
    .is('revoked_at', null);

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<
    Pick<HabitSkipRow, 'habit_id' | 'occurrence_date'>
  >;
}

export async function getActiveHabitSkip(
  supabase: TypedSupabaseClient,
  wsId: string,
  habitId: string,
  occurrenceDate: string
) {
  const { data, error } = await supabase
    .from('habit_skipped_occurrences')
    .select('*')
    .eq('ws_id', wsId)
    .eq('habit_id', habitId)
    .eq('occurrence_date', occurrenceDate)
    .is('revoked_at', null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as HabitSkipRow | null) ?? null;
}

export async function listHabitSkipHistory(
  supabase: TypedSupabaseClient,
  wsId: string,
  habitId: string,
  rangeStart: string,
  rangeEnd: string
) {
  const { data, error } = await supabase
    .from('habit_skipped_occurrences')
    .select('*')
    .eq('ws_id', wsId)
    .eq('habit_id', habitId)
    .gte('occurrence_date', rangeStart)
    .lte('occurrence_date', rangeEnd)
    .order('occurrence_date', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as HabitSkipRow[];
}
