import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { TaskDetailRouteAuthContext } from '../taskId/access';
import {
  canManageProjects,
  jsonError,
  requireTaskScope,
  type TaskScope,
} from './access';
import {
  decodeCursor,
  encodeCursor,
  keysetFilter,
  pageQuerySchema,
} from './cursor';
import { commentBodySchema, commentParamsSchema } from './schemas';
import {
  COMMENT_COLUMNS,
  loadPeople,
  serializeComment,
  type TaskCommentRow,
} from './serialize';

type TaskContext = { params: Promise<{ wsId: string; taskId: string }> };
type CommentContext = {
  params: Promise<{ wsId: string; taskId: string; commentId: string }>;
};

function handleError(error: unknown, label: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Invalid request data', details: error.issues },
      { status: 400 }
    );
  }
  console.error(`Error in ${label}:`, error);
  return jsonError('Internal server error', 500);
}

/** GET .../tasks/:taskId/comments, ascending, deleted rows excluded. */
export async function handleTaskCommentsGET(
  request: NextRequest,
  context: TaskContext,
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
      .schema('private')
      .from('task_comments')
      .select(COMMENT_COLUMNS)
      .eq('task_id', scope.taskId)
      .eq('ws_id', scope.wsId)
      .is('deleted_at', null);
    if (cursor) builder = builder.or(keysetFilter('created_at', cursor, 'asc'));
    const { data, error } = await builder
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(query.data.limit + 1);
    if (error) return jsonError('Failed to load comments', 500);

    const rows = (data ?? []) as TaskCommentRow[];
    const page = rows.slice(0, query.data.limit);
    const last = page[page.length - 1];
    const people = await loadPeople(
      scope.admin,
      scope.wsId,
      scope.user.id,
      page.map((row) => row.author_id)
    );

    return NextResponse.json({
      comments: page.map((row) => serializeComment(row, people)),
      nextCursor:
        rows.length > page.length && last
          ? encodeCursor({ at: last.created_at, id: last.id })
          : null,
    });
  } catch (error) {
    return handleError(error, 'task comments GET');
  }
}

/** POST .../tasks/:taskId/comments, the caller becomes the author. */
export async function handleTaskCommentsPOST(
  request: NextRequest,
  context: TaskContext,
  auth?: TaskDetailRouteAuthContext
) {
  try {
    const scope = await requireTaskScope(request, await context.params, auth, {
      write: true,
    });
    if ('error' in scope) return scope.error;

    const { body } = commentBodySchema.parse(await request.json());
    const { data, error } = await scope.admin
      .schema('private')
      .from('task_comments')
      .insert({
        task_id: scope.taskId,
        ws_id: scope.wsId,
        author_id: scope.user.id,
        body,
      })
      .select(COMMENT_COLUMNS)
      .single();
    if (error || !data) return jsonError('Failed to add comment', 500);

    const people = await loadPeople(scope.admin, scope.wsId, scope.user.id, [
      scope.user.id,
    ]);
    return NextResponse.json(
      { comment: serializeComment(data as TaskCommentRow, people) },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error, 'task comments POST');
  }
}

async function loadActiveComment(
  scope: TaskScope,
  commentId: string
): Promise<{ error: NextResponse } | { row: TaskCommentRow }> {
  const { data, error } = await scope.admin
    .schema('private')
    .from('task_comments')
    .select(COMMENT_COLUMNS)
    .eq('id', commentId)
    .eq('task_id', scope.taskId)
    .eq('ws_id', scope.wsId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { error: jsonError('Failed to load comment', 500) };
  if (!data) return { error: jsonError('Comment not found', 404) };
  return { row: data as TaskCommentRow };
}

/** PATCH .../comments/:commentId, only the author edits. */
export async function handleTaskCommentPATCH(
  request: NextRequest,
  context: CommentContext,
  auth?: TaskDetailRouteAuthContext
) {
  try {
    const params = commentParamsSchema.parse(await context.params);
    const scope = await requireTaskScope(request, params, auth, {
      write: true,
    });
    if ('error' in scope) return scope.error;

    const { body } = commentBodySchema.parse(await request.json());
    const existing = await loadActiveComment(scope, params.commentId);
    if ('error' in existing) return existing.error;
    if (existing.row.author_id !== scope.user.id) {
      return jsonError('Only the author can edit a comment', 403);
    }

    const { data, error } = await scope.admin
      .schema('private')
      .from('task_comments')
      .update({
        body,
        edited_at: new Date().toISOString(),
        updated_by: scope.user.id,
      })
      .eq('id', params.commentId)
      .eq('task_id', scope.taskId)
      .is('deleted_at', null)
      .select(COMMENT_COLUMNS)
      .maybeSingle();
    if (error) return jsonError('Failed to edit comment', 500);
    if (!data) return jsonError('Comment not found', 404);

    const people = await loadPeople(scope.admin, scope.wsId, scope.user.id, [
      scope.user.id,
    ]);
    return NextResponse.json({
      comment: serializeComment(data as TaskCommentRow, people),
    });
  } catch (error) {
    return handleError(error, 'task comment PATCH');
  }
}

/** DELETE .../comments/:commentId, soft delete by the author or a moderator. */
export async function handleTaskCommentDELETE(
  request: NextRequest,
  context: CommentContext,
  auth?: TaskDetailRouteAuthContext
) {
  try {
    const params = commentParamsSchema.parse(await context.params);
    const scope = await requireTaskScope(request, params, auth, {
      write: true,
    });
    if ('error' in scope) return scope.error;

    const existing = await loadActiveComment(scope, params.commentId);
    if ('error' in existing) return existing.error;
    if (
      existing.row.author_id !== scope.user.id &&
      !(await canManageProjects(scope.user, scope.wsId))
    ) {
      return jsonError(
        'Only the author or a moderator can delete a comment',
        403
      );
    }

    const { data, error } = await scope.admin
      .schema('private')
      .from('task_comments')
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: scope.user.id,
      })
      .eq('id', params.commentId)
      .eq('task_id', scope.taskId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) return jsonError('Failed to delete comment', 500);
    if (!data) return jsonError('Comment not found', 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'task comment DELETE');
  }
}
