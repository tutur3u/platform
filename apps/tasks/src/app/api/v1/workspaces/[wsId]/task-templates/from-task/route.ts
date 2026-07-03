import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  buildTaskTemplateInsert,
  createTaskTemplateSchema,
  createTaskTemplatesRouteContext,
  handleUnknownTaskTemplateError,
  isUniqueViolation,
  jsonError,
  normalizeTemplateSlug,
  readJson,
  requireWorkspaceTemplateMutation,
  saveTaskTemplateFromTaskSchema,
  serializeTaskTemplate,
  TASK_TEMPLATES_APP_SESSION_AUTH,
  taskTemplatesTable,
} from '../_lib';

type Params = {
  wsId: string;
};

type SourceTaskRow = {
  assignees?: Array<{ id?: string | null; user_id?: string | null }> | null;
  description?: string | null;
  description_yjs_state?: number[] | null;
  end_date?: string | null;
  estimation_points?: number | null;
  id: string;
  labels?: Array<{ id?: string | null; label_id?: string | null }> | null;
  list_id: string | null;
  name: string | null;
  priority?: 'critical' | 'high' | 'normal' | 'low' | null;
  projects?: Array<{ id?: string | null; project_id?: string | null }> | null;
  start_date?: string | null;
  task_lists?: {
    board_id?: string | null;
    workspace_boards?: {
      id?: string | null;
      ws_id?: string | null;
    } | null;
  } | null;
};

function idsFromRelations<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
  ...keys: Array<keyof T>
) {
  return Array.from(
    new Set(
      (rows ?? []).flatMap((row) => {
        for (const key of keys) {
          const value = row[key];
          if (typeof value === 'string' && value.trim()) {
            return [value];
          }
        }
        return [];
      })
    )
  );
}

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { wsId: rawWsId }) => {
    try {
      const context = await createTaskTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const parsed = saveTaskTemplateFromTaskSchema.parse(
        await readJson(request)
      );
      const taskId = parsed.taskId ?? parsed.task_id;
      if (!taskId) {
        return jsonError('Task ID is required', 400);
      }

      const forbidden = requireWorkspaceTemplateMutation(
        context,
        parsed.visibility
      );
      if (forbidden) return forbidden;

      const { data: sourceTask, error: sourceTaskError } =
        (await context.sbAdmin
          .from('tasks')
          .select(
            `
              id,
              name,
              description,
              description_yjs_state,
              priority,
              start_date,
              end_date,
              estimation_points,
              list_id,
              task_lists!inner (
                id,
                board_id,
                workspace_boards!inner (
                  id,
                  ws_id
                )
              ),
              assignees:task_assignees(
                user_id,
                ...users(
                  id
                )
              ),
              labels:task_labels(
                label_id,
                ...workspace_task_labels(
                  id
                )
              ),
              projects:task_project_tasks(
                project_id,
                ...task_projects(
                  id
                )
              )
            `
          )
          .eq('id', taskId)
          .is('deleted_at', null)
          .maybeSingle()) as {
          data: SourceTaskRow | null;
          error: unknown;
        };

      if (sourceTaskError) {
        return jsonError('Failed to load source task', 500);
      }

      if (
        !sourceTask ||
        sourceTask.task_lists?.workspace_boards?.ws_id !== context.wsId
      ) {
        return jsonError('Task not found', 404);
      }

      const sourceName = sourceTask.name?.trim() || 'Untitled task';
      const templateName = parsed.name ?? sourceName;
      const templateSlug = normalizeTemplateSlug(
        parsed.slug ?? parsed.key ?? templateName
      );

      const insertPayload = buildTaskTemplateInsert(
        createTaskTemplateSchema.parse({
          assignee_ids: idsFromRelations(sourceTask.assignees, 'user_id', 'id'),
          default_board_id: sourceTask.task_lists?.board_id ?? null,
          default_list_id: sourceTask.list_id,
          description: sourceTask.description ?? null,
          description_yjs_state: sourceTask.description_yjs_state ?? null,
          end_date: sourceTask.end_date ?? null,
          estimation_points: sourceTask.estimation_points ?? null,
          key: templateSlug,
          label_ids: idsFromRelations(sourceTask.labels, 'label_id', 'id'),
          name: templateName,
          priority: sourceTask.priority ?? null,
          project_ids: idsFromRelations(
            sourceTask.projects,
            'project_id',
            'id'
          ),
          source_task_id: sourceTask.id,
          start_date: sourceTask.start_date ?? null,
          task_name: sourceName,
          visibility: parsed.visibility,
        }),
        context
      );

      const { data, error } = (await taskTemplatesTable(context.sbAdmin)
        .insert(insertPayload)
        .select('*')
        .single()) as {
        data: Parameters<typeof serializeTaskTemplate>[0] | null;
        error: unknown;
      };

      if (isUniqueViolation(error)) {
        return jsonError(
          'A task template with this key already exists',
          409,
          'TASK_TEMPLATE_KEY_EXISTS'
        );
      }

      if (error || !data) {
        return jsonError('Failed to save task template', 500);
      }

      return NextResponse.json(
        { template: serializeTaskTemplate(data, context.user.id) },
        { status: 201 }
      );
    } catch (error) {
      return handleUnknownTaskTemplateError(
        error,
        'Error saving task template from task'
      );
    }
  },
  { allowAppSessionAuth: TASK_TEMPLATES_APP_SESSION_AUTH }
);
