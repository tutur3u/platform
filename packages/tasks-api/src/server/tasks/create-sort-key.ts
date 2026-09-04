import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import {
  calculateTopSortKey,
  getSortKeyConfig,
  SortKeyGapExhaustedError,
} from '@tuturuuu/utils/task-helper';

type NativeTaskRow = Pick<
  Database['public']['Tables']['tasks']['Row'],
  'created_at' | 'id' | 'sort_key'
>;

type PlacementRow = Pick<
  Database['public']['Tables']['task_user_overrides']['Row'],
  'created_at' | 'personal_placed_at' | 'personal_sort_key' | 'task_id'
>;

type CreateSortKeyContext = {
  boardId: string;
  listId: string;
  userId: string;
};

type EffectiveRow = {
  createdAt: string | null;
  id: string;
  kind: 'native' | 'placement';
  sortKey: number | null;
};

function compareEffectiveRows(left: EffectiveRow, right: EffectiveRow) {
  const leftKey = left.sortKey ?? Number.MAX_SAFE_INTEGER;
  const rightKey = right.sortKey ?? Number.MAX_SAFE_INTEGER;
  if (leftKey !== rightKey) return leftKey - rightKey;
  const leftCreatedAt = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightCreatedAt = right.createdAt ? Date.parse(right.createdAt) : 0;
  return leftCreatedAt - rightCreatedAt;
}

async function loadFirstEffectiveSortKey(
  sbAdmin: TypedSupabaseClient,
  { boardId, listId, userId }: CreateSortKeyContext
) {
  const [nativeResult, placementResult] = await Promise.all([
    sbAdmin
      .from('tasks')
      .select('sort_key')
      .eq('list_id', listId)
      .is('deleted_at', null)
      .order('sort_key', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    sbAdmin
      .from('task_user_overrides')
      .select('personal_sort_key')
      .eq('user_id', userId)
      .eq('personal_board_id', boardId)
      .eq('personal_list_id', listId)
      .not('personal_sort_key', 'is', null)
      .order('personal_sort_key', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (nativeResult.error || placementResult.error) {
    return {
      error: nativeResult.error ?? placementResult.error,
      sortKey: null,
    };
  }

  const nativeKey = nativeResult.data?.sort_key ?? null;
  const placementKey = placementResult.data?.personal_sort_key ?? null;
  const finiteKeys = [nativeKey, placementKey].filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value)
  );

  return {
    error: null,
    sortKey: finiteKeys.length > 0 ? Math.min(...finiteKeys) : null,
  };
}

async function normalizeEffectiveSortKeys(
  sbAdmin: TypedSupabaseClient,
  { boardId, listId, userId }: CreateSortKeyContext
) {
  const [nativeResult, placementResult] = await Promise.all([
    sbAdmin
      .from('tasks')
      .select('id, sort_key, created_at')
      .eq('list_id', listId)
      .is('deleted_at', null),
    sbAdmin
      .from('task_user_overrides')
      .select('task_id, personal_sort_key, personal_placed_at, created_at')
      .eq('user_id', userId)
      .eq('personal_board_id', boardId)
      .eq('personal_list_id', listId)
      .not('personal_sort_key', 'is', null),
  ]);

  if (nativeResult.error || placementResult.error) {
    return nativeResult.error ?? placementResult.error;
  }

  const rows: EffectiveRow[] = [
    ...((nativeResult.data ?? []) as NativeTaskRow[]).map((task) => ({
      createdAt: task.created_at,
      id: task.id,
      kind: 'native' as const,
      sortKey: task.sort_key,
    })),
    ...((placementResult.data ?? []) as PlacementRow[]).map((placement) => ({
      createdAt: placement.personal_placed_at ?? placement.created_at,
      id: placement.task_id,
      kind: 'placement' as const,
      sortKey: placement.personal_sort_key,
    })),
  ].sort(compareEffectiveRows);

  const { BASE_UNIT } = getSortKeyConfig();
  const updates = rows.map((row, index) => ({
    ...row,
    sortKey: (index + 1) * BASE_UNIT,
  }));

  for (let index = 0; index < updates.length; index += 5) {
    const results = await Promise.all(
      updates
        .slice(index, index + 5)
        .map((update) =>
          update.kind === 'native'
            ? sbAdmin
                .from('tasks')
                .update({ sort_key: update.sortKey })
                .eq('id', update.id)
            : sbAdmin
                .from('task_user_overrides')
                .update({ personal_sort_key: update.sortKey })
                .eq('task_id', update.id)
                .eq('user_id', userId)
                .eq('personal_board_id', boardId)
                .eq('personal_list_id', listId)
        )
    );
    const failure = results.find((result) => result.error);
    if (failure?.error) return failure.error;
  }

  return null;
}

export async function resolveCreateTaskSortKey(
  sbAdmin: TypedSupabaseClient,
  context: CreateSortKeyContext
): Promise<{ error: unknown | null; sortKey: number | null }> {
  const { MIN_GAP } = getSortKeyConfig();
  let first = await loadFirstEffectiveSortKey(sbAdmin, context);
  if (first.error) return first;

  if (typeof first.sortKey === 'number' && first.sortKey <= MIN_GAP) {
    const error = await normalizeEffectiveSortKeys(sbAdmin, context);
    if (error) return { error, sortKey: null };
    first = await loadFirstEffectiveSortKey(sbAdmin, context);
    if (first.error) return first;
  }

  try {
    return { error: null, sortKey: calculateTopSortKey(first.sortKey) };
  } catch (error) {
    if (!(error instanceof SortKeyGapExhaustedError)) throw error;
  }

  const normalizationError = await normalizeEffectiveSortKeys(sbAdmin, context);
  if (normalizationError) return { error: normalizationError, sortKey: null };
  first = await loadFirstEffectiveSortKey(sbAdmin, context);
  if (first.error) return first;

  try {
    return { error: null, sortKey: calculateTopSortKey(first.sortKey) };
  } catch (error) {
    return error instanceof SortKeyGapExhaustedError
      ? { error, sortKey: null }
      : Promise.reject(error);
  }
}
