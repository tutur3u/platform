import { createClient, createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const linkTaskSchema = z.object({
  taskId: z.uuid('Task id must be a valid UUID'),
});

interface TaskLabelEntry {
  label: {
    id: string;
    name: string;
    color: string | null;
    created_at: string | null;
  } | null;
}

interface TaskProjectEntry {
  project: {
    id: string;
    name: string;
    status: string | null;
  } | null;
}

interface TaskAssigneeEntry {
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId, projectId } = await params;
    let normalizedWorkspaceId: string;
    try {
      normalizedWorkspaceId = await normalizeWorkspaceId(wsId);
    } catch {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    const supabase = await createClient(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', normalizedWorkspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const { data: projectRecord } = await sbAdmin
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .single();

    if (!projectRecord || projectRecord.ws_id !== normalizedWorkspaceId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: projectTasks, error: tasksError } = await sbAdmin
      .from('task_project_tasks')
      .select(
        `
        task:tasks!inner(
          *,
          assignees:task_assignees(user:users(id, display_name, avatar_url)),
          labels:task_labels(label:workspace_task_labels(id, name, color, created_at)),
          projects:task_project_tasks(project:task_projects(id, name, status))
        )
      `
      )
      .eq('project_id', projectId)
      .is('task.deleted_at', null);

    if (tasksError) {
      console.error('Error fetching project tasks:', tasksError);
      return NextResponse.json(
        { error: 'Failed to fetch project tasks' },
        { status: 500 }
      );
    }

    const rawTasks = (projectTasks ?? [])
      .map((pt) => pt.task)
      .filter(
        (task): task is NonNullable<typeof task> =>
          task !== null && !task.deleted_at
      );

    const listIds = [
      ...new Set(
        rawTasks
          .map((t) => t.list_id)
          .filter((lid): lid is string => lid !== null)
      ),
    ];

    const { data: lists, error: listsError } = await supabase
      .from('task_lists')
      .select('*')
      .in('id', listIds.length > 0 ? listIds : [''])
      .eq('deleted', false);

    if (listsError) {
      console.error('Error fetching task lists:', listsError);
      return NextResponse.json(
        { error: 'Failed to fetch task lists' },
        { status: 500 }
      );
    }

    const formattedTasks: Task[] = rawTasks.map((task) => {
      const normalizedLabels =
        (task.labels as TaskLabelEntry[] | null | undefined)
          ?.map((entry) => entry.label)
          .filter((label): label is NonNullable<Task['labels']>[number] =>
            Boolean(label)
          ) ?? [];

      const normalizedProjects =
        (task.projects as TaskProjectEntry[] | null | undefined)
          ?.map((entry) => entry.project)
          .filter((proj): proj is NonNullable<Task['projects']>[number] =>
            Boolean(proj)
          ) ?? [];

      const normalizedAssignees =
        (task.assignees as TaskAssigneeEntry[] | null | undefined)?.map(
          (entry) => ({
            id: entry.user.id,
            display_name: entry.user.display_name ?? null,
            avatar_url: entry.user.avatar_url ?? null,
          })
        ) ?? [];

      return {
        ...task,
        assignees: normalizedAssignees,
        labels: normalizedLabels,
        projects: normalizedProjects,
      } as Task;
    });

    const formattedLists: TaskList[] = (lists ?? []).map((list) => ({
      ...list,
      name: list.name ?? 'Untitled list',
      archived: list.archived ?? false,
      created_at: list.created_at ?? new Date().toISOString(),
      creator_id: list.creator_id ?? '',
      deleted: list.deleted ?? false,
      position: list.position ?? 0,
      status: list.status ?? 'active',
      color: (list.color as TaskList['color']) ?? 'gray',
    }));

    return NextResponse.json({
      tasks: formattedTasks,
      lists: formattedLists,
    });
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId, projectId } = await params;
    let normalizedWorkspaceId: string;
    try {
      normalizedWorkspaceId = await normalizeWorkspaceId(wsId);
    } catch {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    const supabase = await createClient(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', normalizedWorkspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { taskId } = linkTaskSchema.parse(body);

    const sbAdmin = await createAdminClient();

    // Ensure the project exists in the same workspace
    const { data: projectRecord } = await sbAdmin
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .single();

    if (!projectRecord || projectRecord.ws_id !== normalizedWorkspaceId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch the task and verify workspace ownership
    const { data: taskRecord } = await sbAdmin
      .from('tasks')
      .select(
        `
          id,
          name,
          completed,
          task_lists(
            workspace_boards(ws_id),
            name
          )
        `
      )
      .eq('id', taskId)
      .single();

    if (
      !taskRecord ||
      taskRecord.task_lists?.workspace_boards?.ws_id !== normalizedWorkspaceId
    ) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { error: linkError } = await sbAdmin
      .from('task_project_tasks')
      .insert({
        project_id: projectId,
        task_id: taskId,
      });

    if (linkError) {
      if ('code' in linkError && linkError.code === '23505') {
        return NextResponse.json(
          { error: 'Task already linked to this project' },
          { status: 409 }
        );
      }

      console.error('Error linking task to project:', linkError);
      return NextResponse.json(
        { error: 'Failed to link task to project' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      linkedTask: {
        id: taskRecord.id,
        name: taskRecord.name,
        completed: taskRecord.completed,
        listName: taskRecord.task_lists?.name ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
