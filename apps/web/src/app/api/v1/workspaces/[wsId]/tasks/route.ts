import { createClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_COLOR_LENGTH,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateTaskEmbedding } from '@/lib/embeddings/generate-task-embedding';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(MAX_TASK_NAME_LENGTH),
  description: z
    .string()
    .max(MAX_TASK_DESCRIPTION_LENGTH)
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
interface ProcessedAssignee {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface TaskAssigneeData {
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email?: string;
  } | null;
}

interface TaskLabelData {
  label: {
    id: string;
    name: string | null;
    color: string | null;
  } | null;
}

interface TaskProjectData {
  project: {
    id: string;
    name: string | null;
  } | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWorkspaceId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient(request);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
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

    // Check if this is a request for time tracking (indicated by limit=100 and no specific filters)
    const isTimeTrackingRequest = limit === 100 && !boardId && !listId;

    // Build the query for fetching tasks with assignee information
    let query = supabase
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
          board_id,
          workspace_boards!inner (
            id,
            name,
            ws_id
          )
        ),
        assignees:task_assignees(
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
            color
          )
        ),
        projects:task_project_tasks(
          project:task_projects(
            id,
            name
          )
        )
      `
      )
      .eq('task_lists.workspace_boards.ws_id', normalizedWorkspaceId)
      .is('deleted_at', null);

    // IMPORTANT: If this is for time tracking, apply the same filters as the server-side helper
    if (isTimeTrackingRequest) {
      query = query
        .is('closed_at', null) // Only non-archived tasks
        .in('task_lists.status', ['not_started', 'active']) // Only from active lists
        .eq('task_lists.deleted', false); // Ensure list is not deleted (task_lists still uses boolean)
    }

    // Apply filters based on query parameters
    if (listId) {
      query = query.eq('list_id', listId);
    } else if (boardId) {
      query = query.eq('task_lists.board_id', boardId);
    }

    // Apply ordering and pagination
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Database error in tasks query:', error);
      throw new Error('TASKS_QUERY_FAILED');
    }

    // Transform the data to match the expected WorkspaceTask format
    const tasks =
      data?.map((task) => ({
        id: task.id,
        display_number: task.display_number,
        name: task.name,
        description: task.description,
        priority: task.priority,
        completed: task.completed,
        start_date: task.start_date,
        end_date: task.end_date,
        estimation_points: task.estimation_points,
        created_at: task.created_at,
        list_id: task.list_id,
        closed_at: task.closed_at,
        // Add board information for context
        board_name: task.task_lists?.workspace_boards?.name,
        list_name: task.task_lists?.name,
        list_status: task.task_lists?.status,
        // Add assignee information
        assignees: [
          ...(task.assignees ?? [])
            .map((a: TaskAssigneeData) => a.user)
            .filter((u): u is ProcessedAssignee => !!u?.id)
            .reduce(
              (
                uniqueUsers: Map<string, ProcessedAssignee>,
                user: ProcessedAssignee
              ) => {
                if (!uniqueUsers.has(user.id)) {
                  uniqueUsers.set(user.id, user);
                }
                return uniqueUsers;
              },
              new Map()
            )
            .values(),
        ],
        // Add helper field to identify if current user is assigned
        is_assigned_to_current_user:
          task.assignees?.some(
            (a: TaskAssigneeData) => a.user?.id === user.id
          ) || false,
        labels: [
          ...(task.labels ?? [])
            .map((entry: TaskLabelData) => entry.label)
            .filter(
              (
                label
              ): label is {
                id: string;
                name: string | null;
                color: string | null;
              } => !!label?.id
            )
            .reduce(
              (
                uniqueLabels: Map<
                  string,
                  { id: string; name: string | null; color: string | null }
                >,
                label
              ) => {
                if (!uniqueLabels.has(label.id)) {
                  uniqueLabels.set(label.id, label);
                }
                return uniqueLabels;
              },
              new Map()
            )
            .values(),
        ],
        projects: [
          ...(task.projects ?? [])
            .map((entry: TaskProjectData) => entry.project)
            .filter(
              (
                project
              ): project is {
                id: string;
                name: string | null;
              } => !!project?.id
            )
            .reduce(
              (
                uniqueProjects: Map<
                  string,
                  { id: string; name: string | null }
                >,
                project
              ) => {
                if (!uniqueProjects.has(project.id)) {
                  uniqueProjects.set(project.id, project);
                }
                return uniqueProjects;
              },
              new Map()
            )
            .values(),
        ],
      })) || [];

    // Prioritize tasks by list status for command center (no specific filters)
    // active/not_started tasks appear first, then done/closed
    const shouldPrioritizeByStatus = !listId && !boardId;

    if (shouldPrioritizeByStatus && tasks.length > 0) {
      const statusPriority: Record<string, number> = {
        active: 1,
        not_started: 2,
        done: 3,
        closed: 4,
      };

      tasks.sort((a, b) => {
        const aPriority = statusPriority[a.list_status || ''] || 99;
        const bPriority = statusPriority[b.list_status || ''] || 99;

        // First sort by status priority
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // Then by creation date (newest first)
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      });
    }

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
    const normalizedWorkspaceId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient(request);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
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

    const body = await request.json();
    const validatedData = CreateTaskSchema.parse(body);
    const {
      name: taskName,
      description,
      listId,
      priority,
      start_date,
      end_date,
      estimation_points,
      label_ids,
      project_ids,
      assignee_ids,
    } = validatedData;

    // Verify that the list belongs to a board in this workspace
    const { data: listCheck } = await supabase
      .from('task_lists')
      .select('id, workspace_boards!inner(ws_id)')
      .eq('id', listId)
      .eq('workspace_boards.ws_id', normalizedWorkspaceId)
      .single();

    if (!listCheck) {
      return NextResponse.json(
        { error: 'List not found or access denied' },
        { status: 404 }
      );
    }

    // Create the task
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        name: taskName.trim(),
        description: description?.trim() || null,
        list_id: listId,
        priority: priority || null,
        start_date: start_date || null,
        end_date: end_date || null,
        estimation_points: estimation_points || null,
        created_at: new Date().toISOString(),
        deleted_at: null,
        completed: false,
      } as any)
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
        task_lists (
          id,
          name,
          board_id,
          workspace_boards (
            id,
            name,
            ws_id
          )
        )
      `
      )
      .single();

    if (error) throw error;

    // Insert task labels if provided
    if (label_ids && Array.isArray(label_ids) && label_ids.length > 0) {
      const labelInserts = label_ids.map((labelId) => ({
        task_id: data.id,
        label_id: labelId,
      }));

      const { error: labelError } = await supabase
        .from('task_labels')
        .insert(labelInserts);

      if (labelError) {
        console.error('Failed to insert task labels:', labelError);
        // Continue execution - labels are optional metadata
      }
    }

    // Insert task projects if provided
    if (project_ids && Array.isArray(project_ids) && project_ids.length > 0) {
      const projectInserts = project_ids.map((projectId) => ({
        task_id: data.id,
        project_id: projectId,
      }));

      const { error: projectError } = await supabase
        .from('task_project_tasks')
        .insert(projectInserts);

      if (projectError) {
        console.error('Failed to insert task projects:', projectError);
        // Continue execution - projects are optional metadata
      }
    }

    // Insert task assignees if provided
    if (
      assignee_ids &&
      Array.isArray(assignee_ids) &&
      assignee_ids.length > 0
    ) {
      const assigneeInserts = assignee_ids.map((assigneeId) => ({
        task_id: data.id,
        user_id: assigneeId,
      }));

      const { error: assigneeError } = await supabase
        .from('task_assignees')
        .insert(assigneeInserts);

      if (assigneeError) {
        console.error('Failed to insert task assignees:', assigneeError);
        // Continue execution - assignees are optional metadata
      }
    }

    // Generate embedding (non-blocking)
    generateTaskEmbedding({
      taskId: data.id,
      taskName: data.name,
      taskDescription: data.description,
      supabase,
    }).catch((err) => {
      console.error('Failed to generate embedding in background:', err);
    });

    // Transform the data to match the expected format
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
