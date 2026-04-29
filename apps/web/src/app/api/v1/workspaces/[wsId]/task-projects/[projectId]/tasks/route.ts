import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TaskActorRpcArgs } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const linkTaskSchema = z.object({
  taskId: z.guid('Task id must be a valid UUID'),
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

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWorkspaceId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error('Membership lookup failed:', membership.error);
      return NextResponse.json(
        { error: 'Membership lookup failed' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const { data: projectRecord, error: projectRecordError } = await sbAdmin
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectRecordError) {
      console.error('Error loading project:', projectRecordError);
      return NextResponse.json(
        { error: 'Failed to load project' },
        { status: 500 }
      );
    }

    if (!projectRecord || projectRecord.ws_id !== normalizedWorkspaceId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: projectTasks, error: tasksError } = await sbAdmin
      .from('task_project_tasks')
      .select(
        `
        task:tasks!inner(
          *,
          task_lists(
            workspace_boards(
              ws_id
            )
          ),
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
      .filter((task): task is NonNullable<typeof task> => {
        if (!task || task.deleted_at) {
          return false;
        }

        const boardWorkspaceId = task.task_lists?.workspace_boards?.ws_id;
        return boardWorkspaceId === normalizedWorkspaceId;
      });

    const listIds = [
      ...new Set(
        rawTasks
          .map((t) => t.list_id)
          .filter((lid): lid is string => lid !== null)
      ),
    ];

    let lists: Array<{
      id: string;
      name: string | null;
      archived: boolean | null;
      created_at: string | null;
      board_id: string | null;
      creator_id: string | null;
      deleted: boolean | null;
      position: number | null;
      status: string | null;
      color: string | null;
    }> = [];
    let listsError: { message?: string } | null = null;

    if (listIds.length > 0) {
      const listResult = await sbAdmin
        .from('task_lists')
        .select('*')
        .in('id', listIds)
        .eq('deleted', false);

      lists = listResult.data ?? [];
      listsError = listResult.error;
    }

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
      board_id: list.board_id ?? '',
      creator_id: list.creator_id ?? '',
      deleted: list.deleted ?? false,
      position: list.position ?? 0,
      status: (list.status as TaskList['status']) ?? 'active',
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

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWorkspaceId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error('Membership lookup failed:', membership.error);
      return NextResponse.json(
        { error: 'Membership lookup failed' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { taskId } = linkTaskSchema.parse(body);

    const sbAdmin = await createAdminClient();

    // Ensure the project exists in the same workspace
    const { data: projectRecord, error: projectRecordError } = await sbAdmin
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectRecordError) {
      console.error('Error loading project:', projectRecordError);
      return NextResponse.json(
        { error: 'Failed to load project' },
        { status: 500 }
      );
    }

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

    const linkProjectPayload: TaskActorRpcArgs<'link_task_project_with_actor'> =
      {
        p_task_id: taskId,
        p_project_id: projectId,
        p_actor_user_id: user.id,
      };
    const { error: linkError } = await sbAdmin.rpc(
      'link_task_project_with_actor',
      linkProjectPayload
    );

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
