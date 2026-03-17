import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import {
  MAX_COLOR_LENGTH,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateTaskEmbedding } from './generate-task-embedding';

const SORT_KEY_BASE_UNIT = 1000000;
const SORT_KEY_DEFAULT = SORT_KEY_BASE_UNIT * 1000;

function calculateEndSortKey(prevSortKey: number | null | undefined) {
  const uniqueSuffix =
    typeof performance !== 'undefined'
      ? Math.floor(performance.now() * 1000) % 1000
      : Math.floor((Date.now() % 1000) + Math.random() * 1000) % 1000;

  if (prevSortKey === null || prevSortKey === undefined) {
    return SORT_KEY_DEFAULT + uniqueSuffix;
  }

  return prevSortKey + SORT_KEY_BASE_UNIT + uniqueSuffix;
}

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(MAX_TASK_NAME_LENGTH),
  description: z
    .string()
    .max(MAX_TASK_DESCRIPTION_LENGTH)
    .nullable()
    .optional(),
  description_yjs_state: z
    .array(z.number().int().min(0).max(255))
    .nullable()
    .optional(),
  listId: z.string().uuid(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).nullable().optional(),
  start_date: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  end_date: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  estimation_points: z.number().nullable().optional(),
  label_ids: z.array(z.string().uuid()).optional(),
  project_ids: z.array(z.string().uuid()).optional(),
  assignee_ids: z.array(z.string().uuid()).optional(),
});
interface TaskAssigneeRelation {
  user_id: string | null;
  user: {
    id: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface TaskLabelRelation {
  label: {
    id: string | null;
    name: string | null;
    color: string | null;
    created_at: string | null;
  } | null;
}

interface TaskProjectRelation {
  project: {
    id: string | null;
    name: string | null;
    status: string | null;
  } | null;
}

type TaskInsert = Database['public']['Tables']['tasks']['Insert'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const normalizedWorkspaceId = await normalizeWorkspaceId(wsId, supabase);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWorkspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    const url = new URL(request.url);

    const parsedLimit = Number.parseInt(
      url.searchParams.get('limit') ?? '',
      10
    );
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 200)
        : 100;

    const parsedOffset = Number.parseInt(
      url.searchParams.get('offset') ?? '',
      10
    );
    const offset =
      Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
    const boardId = url.searchParams.get('boardId');
    const listId = url.searchParams.get('listId');
    const searchQuery = url.searchParams.get('q')?.trim();

    const forTimeTracking = url.searchParams.get('forTimeTracking') === 'true';

    let query = sbAdmin
      .from('tasks')
      .select(
        `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        start_date,
        end_date,
        estimation_points,
        created_at,
        list_id,
        closed_at,
        task_lists!inner (
          id,
          name,
          status,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ws_id
          )
        ),
        assignees:task_assignees(
          user_id,
          user:users(
            id,
            display_name,
            avatar_url
          )
        ),
        labels:task_labels(
          label:workspace_task_labels(
            id,
            name,
            color,
            created_at
          )
        ),
        projects:task_project_tasks(
          project:task_projects(
            id,
            name,
            status
          )
        )
      `
      )
      .eq('task_lists.workspace_boards.ws_id', normalizedWorkspaceId)
      .is('deleted_at', null);

    query = query.eq('task_lists.deleted', false);

    if (forTimeTracking) {
      query = query
        .is('closed_at', null)
        .in('task_lists.status', ['not_started', 'active']);
    }

    if (listId) {
      query = query.eq('list_id', listId);
    } else if (boardId) {
      query = query.eq('task_lists.board_id', boardId);
    }

    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Database error in tasks query:', error);
      throw new Error('TASKS_QUERY_FAILED');
    }

    const tasks =
      data?.map((task) => {
        const normalizedAssignees = (task.assignees ?? []).flatMap(
          (entry: TaskAssigneeRelation) => {
            const resolvedId = entry.user?.id || entry.user_id;
            if (!resolvedId) {
              return [];
            }

            return [
              {
                id: resolvedId,
                user_id: resolvedId,
                display_name: entry.user?.display_name ?? undefined,
                avatar_url: entry.user?.avatar_url ?? undefined,
              },
            ];
          }
        );

        const assigneeIds = Array.from(
          new Set(normalizedAssignees.map((assignee) => assignee.id))
        );

        const normalizedLabels = (task.labels ?? []).flatMap(
          (entry: TaskLabelRelation) => {
            if (!entry.label?.id) {
              return [];
            }

            return [
              {
                id: entry.label.id,
                name: entry.label.name ?? undefined,
                color: entry.label.color ?? undefined,
                created_at: entry.label.created_at ?? undefined,
              },
            ];
          }
        );

        const labelIds = Array.from(
          new Set(normalizedLabels.map((label) => label.id))
        );

        const normalizedProjects = (task.projects ?? []).flatMap(
          (entry: TaskProjectRelation) => {
            if (!entry.project?.id) {
              return [];
            }

            return [
              {
                id: entry.project.id,
                name: entry.project.name ?? undefined,
                status: entry.project.status ?? undefined,
              },
            ];
          }
        );

        const projectIds = Array.from(
          new Set(normalizedProjects.map((project) => project.id))
        );

        return {
          ...task,
          assignees: normalizedAssignees,
          labels: normalizedLabels,
          projects: normalizedProjects,
          assignee_ids: assigneeIds,
          label_ids: labelIds,
          project_ids: projectIds,
          list_deleted: task.task_lists?.deleted ?? false,
        };
      }) ?? [];

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const normalizedWorkspaceId = await normalizeWorkspaceId(wsId, supabase);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWorkspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = CreateTaskSchema.parse(await request.json());
    const {
      name,
      description,
      description_yjs_state,
      listId,
      priority,
      start_date,
      end_date,
      estimation_points,
      label_ids,
      project_ids,
      assignee_ids,
    } = body;

    const sbAdmin = await createAdminClient();
    const { data: listRow, error: listError } = await sbAdmin
      .from('task_lists')
      .select(
        `
        id,
        board_id,
        status,
        deleted,
        workspace_boards!inner(
          ws_id
        )
      `
      )
      .eq('id', listId)
      .maybeSingle();

    if (listError) {
      console.error('Error validating list:', listError);
      return NextResponse.json(
        { error: 'Failed to validate list' },
        { status: 500 }
      );
    }

    if (!listRow || listRow.workspace_boards?.ws_id !== normalizedWorkspaceId) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    if (listRow.deleted) {
      return NextResponse.json({ error: 'List is archived' }, { status: 400 });
    }

    const { data: lastTask, error: lastTaskError } = await sbAdmin
      .from('tasks')
      .select('sort_key')
      .eq('list_id', listId)
      .is('deleted_at', null)
      .order('sort_key', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastTaskError) {
      console.error('Error fetching last sort key:', lastTaskError);
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      );
    }

    const sort_key = calculateEndSortKey(lastTask?.sort_key ?? null);
    const now = new Date().toISOString();
    const shouldArchive =
      listRow.status === 'done' || listRow.status === 'closed';

    const taskInsert: TaskInsert = {
      name: name.trim(),
      description: description?.trim() || null,
      list_id: listId,
      priority: priority ?? null,
      start_date: start_date ?? null,
      end_date: end_date ?? null,
      estimation_points: estimation_points ?? null,
      sort_key,
      closed_at: shouldArchive ? now : null,
    };

    const { data, error } = await sbAdmin
      .from('tasks')
      .insert({
        ...taskInsert,
        description_yjs_state,
      })
      .select(
        `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        start_date,
        end_date,
        estimation_points,
        created_at,
        list_id,
        task_lists!inner(
          id,
          name,
          workspace_boards!inner(
            name
          )
        )
      `
      )
      .maybeSingle();

    if (error) {
      console.error('Error creating task:', error);
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      );
    }

    if (label_ids && Array.isArray(label_ids) && label_ids.length > 0) {
      const labelInserts = label_ids.map((labelId) => ({
        task_id: data.id,
        label_id: labelId,
      }));

      const { error: labelError } = await sbAdmin
        .from('task_labels')
        .insert(labelInserts);

      if (labelError) {
        console.error('Failed to insert task labels:', labelError);
      }
    }

    if (project_ids && Array.isArray(project_ids) && project_ids.length > 0) {
      const projectInserts = project_ids.map((projectId) => ({
        task_id: data.id,
        project_id: projectId,
      }));

      const { error: projectError } = await sbAdmin
        .from('task_project_tasks')
        .insert(projectInserts);

      if (projectError) {
        console.error('Failed to insert task projects:', projectError);
      }
    }

    if (
      assignee_ids &&
      Array.isArray(assignee_ids) &&
      assignee_ids.length > 0
    ) {
      const assigneeInserts = assignee_ids.map((assigneeId) => ({
        task_id: data.id,
        user_id: assigneeId,
      }));

      const { error: assigneeError } = await sbAdmin
        .from('task_assignees')
        .insert(assigneeInserts);

      if (assigneeError) {
        console.error('Failed to insert task assignees:', assigneeError);
      }
    }

    generateTaskEmbedding({
      taskId: data.id,
      taskName: data.name,
      taskDescription: data.description,
      supabase: sbAdmin,
    }).catch((err) => {
      console.error('Failed to generate embedding in background:', err);
    });

    const task = {
      id: data.id,
      display_number: data.display_number,
      name: data.name,
      description: data.description,
      priority: data.priority,
      completed: data.completed,
      start_date: data.start_date,
      end_date: data.end_date,
      estimation_points: data.estimation_points,
      created_at: data.created_at,
      list_id: data.list_id,
      board_name: data.task_lists?.workspace_boards?.name,
      list_name: data.task_lists?.name,
    };

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
