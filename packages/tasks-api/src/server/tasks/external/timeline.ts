import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { TaskDetailRouteAuthContext } from '../taskId/access';
import { jsonError, requireTaskScope } from './access';
import {
  decodeCursor,
  encodeCursor,
  keysetFilter,
  pageQuerySchema,
} from './cursor';
import {
  COMMENT_COLUMNS,
  loadPeople,
  serializeComment,
  type TaskComment,
  type TaskCommentRow,
  type TaskPerson,
} from './serialize';

type HistoryRow = {
  id: string;
  change_type: string;
  changed_at: string;
  changed_by: string | null;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown> | null;
};

export type TimelineEvent = {
  id: string;
  type: string;
  at: string;
  actor: TaskPerson | null;
  external_actor: string | null;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown>;
  comment?: TaskComment;
};

function externalActor(metadata: Record<string, unknown> | null) {
  const value = metadata?.external_author ?? metadata?.external_actor;
  return typeof value === 'string' && value ? value : null;
}

/**
 * GET .../tasks/:taskId/timeline: task_history, newest first, with the body
 * of each live comment_added event attached. History itself never stores
 * comment bodies, so a deleted comment shows as an event without text.
 */
export async function handleTaskTimelineGET(
  request: NextRequest,
  context: { params: Promise<{ wsId: string; taskId: string }> },
  auth?: TaskDetailRouteAuthContext
) {
  try {
    const scope = await requireTaskScope(request, await context.params, auth);
    if ('error' in scope) return scope.error;

    const search = new URL(request.url).searchParams;
    const query = pageQuerySchema.safeParse({
      cursor: search.get('cursor'),
      limit: search.get('limit'),
    });
    if (!query.success) return jsonError('Invalid query parameters', 400);
    const cursor = decodeCursor(query.data.cursor ?? null);
    if (query.data.cursor && !cursor) return jsonError('Invalid cursor', 400);

    let builder = scope.admin
      .from('task_history')
      .select(
        'id, change_type, changed_at, changed_by, field_name, old_value, new_value, metadata'
      )
      .eq('task_id', scope.taskId)
      .is('deleted_at', null);
    if (cursor)
      builder = builder.or(keysetFilter('changed_at', cursor, 'desc'));
    const { data, error } = await builder
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(query.data.limit + 1);
    if (error) return jsonError('Failed to load timeline', 500);

    const rows = (data ?? []) as HistoryRow[];
    const page = rows.slice(0, query.data.limit);
    const last = page[page.length - 1];

    const commentIds = page.flatMap((row) =>
      row.change_type === 'comment_added' &&
      typeof row.metadata?.comment_id === 'string'
        ? [row.metadata.comment_id]
        : []
    );
    const commentRows = commentIds.length
      ? await scope.admin
          .schema('private')
          .from('task_comments')
          .select(COMMENT_COLUMNS)
          .eq('task_id', scope.taskId)
          .eq('ws_id', scope.wsId)
          .is('deleted_at', null)
          .in('id', commentIds)
      : { data: [], error: null };
    if (commentRows.error) return jsonError('Failed to load timeline', 500);
    const comments = new Map(
      ((commentRows.data ?? []) as TaskCommentRow[]).map((row) => [row.id, row])
    );

    const people = await loadPeople(scope.admin, scope.wsId, scope.user.id, [
      ...page.map((row) => row.changed_by),
      ...[...comments.values()].map((row) => row.author_id),
    ]);

    const events: TimelineEvent[] = page.map((row) => {
      const commentId = row.metadata?.comment_id;
      const commentRow =
        row.change_type === 'comment_added' && typeof commentId === 'string'
          ? comments.get(commentId)
          : undefined;
      return {
        id: row.id,
        type: row.change_type,
        at: row.changed_at,
        actor: row.changed_by ? (people.get(row.changed_by) ?? null) : null,
        external_actor: externalActor(row.metadata),
        field_name: row.field_name,
        old_value: row.old_value ?? null,
        new_value: row.new_value ?? null,
        metadata: row.metadata ?? {},
        ...(commentRow
          ? { comment: serializeComment(commentRow, people) }
          : {}),
      };
    });

    return NextResponse.json({
      events,
      nextCursor:
        rows.length > page.length && last
          ? encodeCursor({ at: last.changed_at, id: last.id })
          : null,
    });
  } catch (error) {
    console.error('Error in task timeline GET:', error);
    return jsonError('Internal server error', 500);
  }
}
