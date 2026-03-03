import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';
import { buildToolFailure } from './timer-helpers';

const encodeCategoryCursorName = (value: string) => encodeURIComponent(value);

const decodeCategoryCursorName = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export type TimeTrackingCategoryRow = {
  id: string;
  ws_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export async function executeListTimeTrackingCategories(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const limitRaw = Number(args.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), 50)
      : 20;
  const cursor = args.cursor;

  let query = ctx.supabase
    .from('time_tracking_categories')
    .select('id, ws_id, name, description, color, created_at, updated_at')
    .eq('ws_id', workspaceId)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1);

  if (cursor !== undefined) {
    if (typeof cursor !== 'string') {
      return buildToolFailure(
        'TT_CATEGORIES_INVALID_CURSOR',
        'Invalid cursor format',
        false
      );
    }

    const separatorIndex = cursor.lastIndexOf('|');
    if (separatorIndex <= 0 || separatorIndex === cursor.length - 1) {
      return buildToolFailure(
        'TT_CATEGORIES_INVALID_CURSOR',
        'Invalid cursor format',
        false
      );
    }

    const rawName = cursor.slice(0, separatorIndex);
    const lastId = cursor.slice(separatorIndex + 1);
    const lastName = decodeCategoryCursorName(rawName);
    if (!lastName || !lastId) {
      return buildToolFailure(
        'TT_CATEGORIES_INVALID_CURSOR',
        'Invalid cursor format',
        false
      );
    }

    const esc = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    query = query.or(
      `name.gt."${esc(lastName)}",and(name.eq."${esc(lastName)}",id.gt."${esc(lastId)}")`
    );
  }

  const { data, error } = await query;
  if (error) {
    return buildToolFailure('TT_CATEGORIES_FETCH_FAILED', error.message, true);
  }

  const rows = (data ?? []) as TimeTrackingCategoryRow[];
  const hasMore = rows.length > limit;
  const categories = hasMore ? rows.slice(0, limit) : rows;
  const last = categories[categories.length - 1];

  return {
    success: true,
    categories,
    count: categories.length,
    hasMore,
    nextCursor: last
      ? `${encodeCategoryCursorName(last.name)}|${last.id}`
      : null,
    meta: {
      workspaceId,
      workspaceContextId: ctx.workspaceContext?.workspaceContextId ?? ctx.wsId,
      isPersonalContext: ctx.workspaceContext?.personal ?? false,
      filtersApplied: {
        cursorProvided: cursor !== undefined,
        limit,
      },
    },
  };
}
