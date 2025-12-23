import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { embed } from 'ai';

export const maxDuration = 30;

type ToolCallRequest = {
  wsId: string;
  functionName: string;
  args: Record<string, unknown>;
};

/**
 * Normalizes workspace ID from slug to UUID for API routes
 * - "personal" → User's personal workspace UUID (DB query)
 * - "internal" → ROOT_WORKSPACE_ID constant
 * - Valid UUID → Passes through unchanged
 *
 * Note: We can't use getWorkspace() here because it uses redirect()/notFound()
 * which don't work in API routes. Instead, we query the database directly.
 */
async function normalizeWorkspaceId(wsId: string): Promise<string> {
  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    // Query personal workspace directly for API route context
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get user's personal workspace (joined via workspace_members)
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('workspace_members.user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error(
        '[normalizeWorkspaceId] Database error resolving personal workspace:',
        {
          userId: user.id,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
        }
      );
      throw new Error(`Personal workspace query failed: ${error.message}`);
    }

    if (!workspace) {
      console.error(
        '[normalizeWorkspaceId] Personal workspace not found for user:',
        {
          userId: user.id,
        }
      );
      throw new Error(
        'Personal workspace not found. Please ensure your account has a personal workspace.'
      );
    }

    console.log('[normalizeWorkspaceId] Personal workspace resolved:', {
      userId: user.id,
      workspaceId: workspace.id,
    });

    return workspace.id;
  }
  return resolveWorkspaceId(wsId);
}

export async function POST(req: Request) {
  let functionName: string | undefined;

  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate Tuturuuu email
    if (!isValidTuturuuuEmail(user.email)) {
      return Response.json(
        { error: 'Only Tuturuuu emails are allowed' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as ToolCallRequest;
    const { wsId, args } = body;
    functionName = body.functionName;

    if (!wsId || !functionName) {
      return Response.json(
        { error: 'Missing required fields: wsId, functionName' },
        { status: 400 }
      );
    }

    // 3. Normalize workspace ID (personal → UUID, internal → ROOT_WORKSPACE_ID)
    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId);
      console.log('[Tools Execute] Workspace ID normalized:', {
        original: wsId,
        normalized: normalizedWsId,
        functionName,
      });
    } catch (error) {
      console.error('[Tools Execute] Workspace resolution failed:', {
        wsId,
        functionName,
        error: error instanceof Error ? error.message : error,
      });
      return Response.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      );
    }

    // 4. Execute the tool based on function name
    let result: unknown;

    switch (functionName) {
      case 'get_my_tasks':
        result = await getMyTasks(normalizedWsId, user.id, args);
        break;
      case 'search_tasks':
        result = await searchTasks(normalizedWsId, args);
        break;
      case 'create_task':
        result = await createTask(normalizedWsId, args);
        break;
      case 'update_task':
        result = await updateTask(normalizedWsId, args);
        break;
      case 'delete_task':
        result = await deleteTask(normalizedWsId, args);
        break;
      case 'get_task_details':
        result = await getTaskDetails(normalizedWsId, args);
        break;
      case 'get_workspace_members':
        result = await getWorkspaceMembers(normalizedWsId, args);
        break;
      case 'get_tasks_by_assignee':
        result = await getTasksByAssignee(normalizedWsId, args);
        break;

      // Visualization tools
      case 'visualize_task_list':
        result = await visualizeTaskList(normalizedWsId, user.id, args);
        break;
      case 'visualize_timeline':
        result = await visualizeTimeline(normalizedWsId, user.id, args);
        break;
      case 'visualize_status_breakdown':
        result = await visualizeStatusBreakdown(normalizedWsId, user.id, args);
        break;
      case 'visualize_task_detail':
        result = await visualizeTaskDetail(normalizedWsId, args);
        break;
      case 'dismiss_visualization':
        result = {
          action: 'dismiss_visualization',
          visualizationId: (args.visualizationId as string) || 'all',
        };
        break;
      case 'visualize_workspace_members':
        result = await visualizeWorkspaceMembers(normalizedWsId, args);
        break;
      case 'visualize_assignee_tasks':
        result = await visualizeAssigneeTasks(normalizedWsId, args);
        break;

      default:
        return Response.json(
          { error: `Unknown function: ${functionName}` },
          { status: 400 }
        );
    }

    console.log('[Tools Execute] Tool executed successfully:', {
      functionName,
      resultType: typeof result,
      resultKeys:
        result && typeof result === 'object' ? Object.keys(result) : null,
    });

    return Response.json({ result });
  } catch (error) {
    console.error('[Tools Execute] Error executing tool:', {
      functionName,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json(
      {
        error: 'Failed to execute tool',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Tool implementations

async function getMyTasks(
  normalizedWsId: string,
  userId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const category = (args.category as string) || 'all';

  // Fetch all accessible tasks using the RPC function
  const { data: rpcTasks, error: tasksError } = await supabase.rpc(
    'get_user_accessible_tasks',
    {
      p_user_id: userId,
      p_ws_id: normalizedWsId,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active', 'done'],
    }
  );

  console.log('getMyTasks RPC result:', {
    userId,
    wsId: normalizedWsId,
    category,
    tasksCount: rpcTasks?.length ?? 0,
    error: tasksError,
  });

  if (tasksError) {
    throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
  }

  // Map RPC results to a simpler structure
  // Note: The RPC already filters by p_list_statuses, so returned tasks are in specified statuses
  type RpcTask = {
    task_id: string;
    task_name: string;
    task_description: string | null;
    task_priority: string | null;
    task_completed_at: string | null;
    task_closed_at: string | null;
    task_end_date: string | null;
    task_start_date: string | null;
    task_created_at: string;
  };

  const allTasks = (rpcTasks || []).map((task: RpcTask) => ({
    id: task.task_id,
    name: task.task_name,
    description: task.task_description
      ? extractTextFromDescription(task.task_description)
      : null,
    priority: task.task_priority,
    priorityLabel: getPriorityLabel(task.task_priority),
    completed: !!task.task_completed_at,
    closed: !!task.task_closed_at,
    endDate: task.task_end_date,
    startDate: task.task_start_date,
    createdAt: task.task_created_at,
  }));

  // Categorize tasks with proper date handling (avoid mutation)
  const now = new Date().toISOString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();
  today.setHours(23, 59, 59, 999);
  const todayEnd = today.toISOString();

  type MappedTask = {
    id: string;
    name: string;
    description: string | null;
    priority: string | null;
    priorityLabel: string;
    completed: boolean;
    closed: boolean;
    endDate: string | null;
    startDate: string | null;
    createdAt: string;
  };

  // Filter for active (not completed, not closed) tasks
  // Note: RPC already filters by list status, so we just need to check completion state
  const activeTasks = allTasks.filter(
    (task: MappedTask) => !task.completed && !task.closed
  );

  const overdueTasks = activeTasks.filter(
    (task: MappedTask) => task.endDate && task.endDate < now
  );

  const todayTasks = activeTasks.filter(
    (task: MappedTask) =>
      task.endDate &&
      task.endDate >= todayStart &&
      task.endDate <= todayEnd &&
      task.endDate >= now
  );

  const upcomingTasks = activeTasks.filter(
    (task: MappedTask) => !task.endDate || task.endDate > todayEnd
  );

  // Return based on category filter
  type TaskResult = {
    totalActive: number;
    overdue?: { count: number; tasks: MappedTask[] };
    today?: { count: number; tasks: MappedTask[] };
    upcoming?: { count: number; tasks: MappedTask[] };
  };

  // Helper to sort tasks: by end date (nulls last), then by priority, then by creation date
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  const sortTasks = (tasks: MappedTask[]) =>
    [...tasks].sort((a, b) => {
      // Sort by end date (ascending, nulls last)
      if (a.endDate && !b.endDate) return -1;
      if (!a.endDate && b.endDate) return 1;
      if (a.endDate && b.endDate) {
        const dateCompare = a.endDate.localeCompare(b.endDate);
        if (dateCompare !== 0) return dateCompare;
      }
      // Then by priority (higher priority first)
      const aPriority = priorityOrder[a.priority ?? 'normal'] ?? 2;
      const bPriority = priorityOrder[b.priority ?? 'normal'] ?? 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      // Then by creation date (oldest first)
      return a.createdAt.localeCompare(b.createdAt);
    });

  const result: TaskResult = {
    totalActive: overdueTasks.length + todayTasks.length + upcomingTasks.length,
  };

  if (category === 'all' || category === 'overdue') {
    result.overdue = {
      count: overdueTasks.length,
      tasks: sortTasks(overdueTasks).slice(0, 50), // Sort then limit to 50 per category
    };
  }
  if (category === 'all' || category === 'today') {
    result.today = {
      count: todayTasks.length,
      tasks: sortTasks(todayTasks).slice(0, 50),
    };
  }
  if (category === 'all' || category === 'upcoming') {
    result.upcoming = {
      count: upcomingTasks.length,
      tasks: sortTasks(upcomingTasks).slice(0, 50),
    };
  }

  return result;
}

async function searchTasks(
  normalizedWsId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const query = args.query as string;
  const matchCount = Math.min((args.matchCount as number) || 50, 50);
  const matchThreshold = 0.3;

  // Expand query for better semantic matching
  const expandedQuery = expandQuery(query);

  // Generate embedding for the query
  const { embedding } = await embed({
    model: google.embeddingModel('gemini-embedding-001'),
    value: expandedQuery,
    providerOptions: {
      google: {
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      },
    },
  });

  // Call the hybrid search function
  const { data, error } = await supabase.rpc('match_tasks', {
    query_embedding: JSON.stringify(embedding),
    query_text: query,
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_ws_id: normalizedWsId,
    filter_deleted: false,
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  // Return simplified results for the AI
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = (data || []) as any[];

  return {
    count: tasks.length,
    tasks: tasks.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description
        ? extractTextFromDescription(task.description)
        : null,
      priority: task.priority,
      completed: task.completed,
      similarity: task.similarity,
    })),
  };
}

async function createTask(
  normalizedWsId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const name = args.name as string;
  const description = args.description as string | undefined;
  const priorityArg = args.priority as string | undefined;

  // Map priority string to enum value
  const validPriorities = ['low', 'normal', 'high', 'critical'] as const;
  type TaskPriority = (typeof validPriorities)[number];
  const priority: TaskPriority | null =
    priorityArg && validPriorities.includes(priorityArg as TaskPriority)
      ? (priorityArg as TaskPriority)
      : null;

  // First, get the default board and list for the workspace
  const { data: board, error: boardError } = await supabase
    .from('workspace_boards')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .limit(1)
    .single();

  if (boardError || !board) {
    throw new Error('No task board found in this workspace');
  }

  // Get or create a default list
  const { data: list, error: listError } = await supabase
    .from('task_lists')
    .select('id')
    .eq('board_id', board.id)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (listError || !list) {
    throw new Error('No task list found in this workspace');
  }

  // Create the task
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      name,
      description: description
        ? JSON.stringify({
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: description }],
              },
            ],
          })
        : null,
      list_id: list.id,
      priority,
      completed: false,
    })
    .select('id, name, priority, created_at')
    .single();

  if (taskError) {
    throw new Error(`Failed to create task: ${taskError.message}`);
  }

  return {
    success: true,
    message: `Task "${name}" created successfully`,
    task,
  };
}

async function updateTask(
  normalizedWsId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const taskId = args.taskId as string;
  const updates: Record<string, unknown> = {};

  // Valid priority values for the database enum
  const validPriorities = ['low', 'normal', 'high', 'critical'] as const;
  type TaskPriority = (typeof validPriorities)[number];

  if (args.name !== undefined) updates.name = args.name;
  if (args.priority !== undefined) {
    const priorityArg = args.priority as string;
    if (validPriorities.includes(priorityArg as TaskPriority)) {
      updates.priority = priorityArg;
    }
  }
  if (args.completed !== undefined) {
    updates.completed = args.completed;
    if (args.completed) {
      updates.completed_at = new Date().toISOString();
    }
  }
  if (args.description !== undefined) {
    updates.description = args.description
      ? JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: args.description as string }],
            },
          ],
        })
      : null;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, message: 'No updates provided' };
  }

  // Verify task belongs to workspace
  const { data: task, error: verifyError } = await supabase
    .from('tasks')
    .select(
      'id, list_id, task_lists!inner(board_id, workspace_boards!inner(ws_id))'
    )
    .eq('id', taskId)
    .single();

  if (verifyError || !task) {
    throw new Error('Task not found');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskWsId = (task as any).task_lists?.workspace_boards?.ws_id;
  if (taskWsId !== normalizedWsId) {
    throw new Error('Task does not belong to this workspace');
  }

  // Update the task
  const { error: updateError } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId);

  if (updateError) {
    throw new Error(`Failed to update task: ${updateError.message}`);
  }

  return {
    success: true,
    message: 'Task updated successfully',
    updates,
  };
}

async function deleteTask(
  normalizedWsId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const taskId = args.taskId as string;

  // Verify task belongs to workspace
  const { data: task, error: verifyError } = await supabase
    .from('tasks')
    .select(
      'id, name, list_id, task_lists!inner(board_id, workspace_boards!inner(ws_id))'
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .single();

  if (verifyError || !task) {
    throw new Error('Task not found or already deleted');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskWsId = (task as any).task_lists?.workspace_boards?.ws_id;
  if (taskWsId !== normalizedWsId) {
    throw new Error('Task does not belong to this workspace');
  }

  // Soft delete the task
  const { error: deleteError } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', taskId);

  if (deleteError) {
    throw new Error(`Failed to delete task: ${deleteError.message}`);
  }

  return {
    success: true,
    message: `Task "${task.name}" moved to trash`,
  };
}

async function getTaskDetails(
  normalizedWsId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const taskId = args.taskId as string;

  const { data: task, error } = await supabase
    .from('tasks')
    .select(
      `
      id,
      name,
      description,
      priority,
      completed,
      created_at,
      start_date,
      end_date,
      estimation_points,
      task_labels(workspace_task_labels(name, color)),
      task_assignees(users(display_name, avatar_url)),
      task_lists!inner(
        name,
        board_id,
        workspace_boards!inner(name, ws_id)
      )
    `
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .single();

  if (error || !task) {
    throw new Error('Task not found');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskWsId = (task as any).task_lists?.workspace_boards?.ws_id;
  if (taskWsId !== normalizedWsId) {
    throw new Error('Task does not belong to this workspace');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskAny = task as any;
  return {
    id: task.id,
    name: task.name,
    description: task.description
      ? extractTextFromDescription(task.description)
      : null,
    priority: task.priority,
    priorityLabel: getPriorityLabel(task.priority),
    completed: task.completed,
    createdAt: task.created_at,
    startDate: task.start_date,
    endDate: task.end_date,
    estimationPoints: task.estimation_points,
    board: taskAny.task_lists?.workspace_boards?.name,
    list: taskAny.task_lists?.name,
    labels: (taskAny.task_labels || []).map(
      (tl: { workspace_task_labels?: { name?: string; color?: string } }) => ({
        name: tl.workspace_task_labels?.name,
        color: tl.workspace_task_labels?.color,
      })
    ),
    assignees: (taskAny.task_assignees || []).map(
      (ta: { users?: { display_name?: string } }) => ({
        name: ta.users?.display_name,
      })
    ),
  };
}

async function getWorkspaceMembers(
  wsId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const includeInvited = (args.includeInvited as boolean) ?? false;

  let query = supabase
    .from('workspace_members_and_invites')
    .select('id, display_name, avatar_url, email, pending')
    .eq('ws_id', wsId)
    .order('display_name');

  if (!includeInvited) {
    query = query.eq('pending', false);
  }

  const { data, error } = await query.limit(100);

  if (error) throw error;

  return {
    members: (data || []).map((m) => ({
      id: m.id,
      name: m.display_name || m.email || 'Unknown',
      avatarUrl: m.avatar_url,
      isPending: m.pending,
    })),
    count: data?.length || 0,
  };
}

type TaskListStatus =
  | 'not_started'
  | 'active'
  | 'done'
  | 'closed'
  | 'documents';

async function getTasksByAssignee(wsId: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const targetUserId = args.userId as string | undefined;
  const userName = args.userName as string | undefined;
  const rawListStatuses = args.listStatuses as string[] | undefined;
  const listStatuses: TaskListStatus[] = rawListStatuses
    ? (rawListStatuses.filter((s) =>
        ['not_started', 'active', 'done', 'closed', 'documents'].includes(s)
      ) as TaskListStatus[])
    : ['not_started', 'active'];
  const includeCompleted = (args.includeCompleted as boolean) ?? false;

  let assigneeId = targetUserId;
  let assigneeName: string | null = null;
  let assigneeAvatarUrl: string | null = null;

  // If userName provided, find matching user
  if (!assigneeId && userName) {
    const { data: members } = await supabase
      .from('workspace_members_and_invites')
      .select('id, display_name, avatar_url')
      .eq('ws_id', wsId)
      .eq('pending', false)
      .ilike('display_name', `%${userName}%`)
      .limit(1);

    if (members?.[0]?.id) {
      assigneeId = members[0].id;
      assigneeName = members[0].display_name ?? null;
      assigneeAvatarUrl = members[0].avatar_url ?? null;
    }
  } else if (assigneeId) {
    // Get name for the provided userId
    const { data: member } = await supabase
      .from('workspace_members_and_invites')
      .select('display_name, avatar_url')
      .eq('ws_id', wsId)
      .eq('id', assigneeId)
      .single();
    assigneeName = member?.display_name || null;
    assigneeAvatarUrl = member?.avatar_url || null;
  }

  if (!assigneeId) {
    return {
      error: 'No matching member found',
      tasks: [],
      count: 0,
    };
  }

  // Get task IDs assigned to this user
  const { data: taskAssignments } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', assigneeId);

  const taskIds = taskAssignments?.map((t) => t.task_id) || [];

  if (taskIds.length === 0) {
    return {
      assignee: {
        id: assigneeId,
        name: assigneeName,
        avatarUrl: assigneeAvatarUrl,
      },
      tasks: [],
      count: 0,
      message: 'No tasks assigned to this member',
    };
  }

  // Fetch task details with workspace and list status filter
  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      `
      id, name, description, priority, start_date, end_date, completed_at,
      task_lists!inner(name, status, workspace_boards!inner(name, ws_id))
    `
    )
    .in('id', taskIds)
    .is('deleted_at', null)
    .eq('task_lists.workspace_boards.ws_id', wsId)
    .in('task_lists.status', listStatuses)
    .limit(50);

  // Filter by completion status (completed_at timestamp)
  const filteredTasks = includeCompleted
    ? tasks
    : tasks?.filter((t) => !t.completed_at);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    assignee: {
      id: assigneeId,
      name: assigneeName,
      avatarUrl: assigneeAvatarUrl,
    },
    tasks: (filteredTasks || []).map((t) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taskAny = t as any;
      return {
        id: t.id,
        name: t.name,
        description: t.description
          ? extractTextFromDescription(t.description)
          : null,
        priority: t.priority,
        priorityLabel: getPriorityLabel(t.priority),
        startDate: t.start_date,
        endDate: t.end_date,
        isCompleted: !!t.completed_at,
        listName: taskAny.task_lists?.name,
        listStatus: taskAny.task_lists?.status,
        boardName: taskAny.task_lists?.workspace_boards?.name,
      };
    }),
    count: filteredTasks?.length || 0,
  };
}

async function visualizeWorkspaceMembers(
  wsId: string,
  args: Record<string, unknown>
) {
  const title = (args.title as string) || 'Team Members';
  const includeInvited = (args.includeInvited as boolean) ?? false;

  const membersResult = await getWorkspaceMembers(wsId, { includeInvited });

  return {
    action: 'visualize_workspace_members',
    memberCount: membersResult.count,
    members: membersResult.members,
    visualization: {
      type: 'workspace_members' as const,
      data: {
        title,
        members: membersResult.members,
        totalCount: membersResult.count,
      },
    },
  };
}

async function visualizeAssigneeTasks(
  wsId: string,
  args: Record<string, unknown>
) {
  const title = (args.title as string) || 'Assigned Tasks';

  const tasksResult = await getTasksByAssignee(wsId, args);

  if (tasksResult.error) {
    return {
      action: 'visualize_assignee_tasks',
      error: tasksResult.error,
    };
  }

  return {
    action: 'visualize_assignee_tasks',
    assignee: tasksResult.assignee,
    taskCount: tasksResult.count,
    tasks: tasksResult.tasks,
    visualization: {
      type: 'assignee_tasks' as const,
      data: {
        title,
        assignee: tasksResult.assignee,
        tasks: tasksResult.tasks,
        totalCount: tasksResult.count,
      },
    },
  };
}

// Helper functions

function expandQuery(query: string): string {
  const expansions: Record<string, string> = {
    todo: 'todo task to-do to do pending incomplete not done',
    done: 'done completed finished closed resolved',
    wip: 'wip work in progress working on in-progress active ongoing',
    bug: 'bug issue problem error defect fix broken',
    feature: 'feature enhancement improvement new functionality request',
    urgent: 'urgent important high priority critical asap rush',
    blocked: 'blocked waiting dependency stuck impediment',
  };

  let expanded = query;
  for (const [key, value] of Object.entries(expansions)) {
    if (query.toLowerCase().includes(key)) {
      expanded = `${expanded} ${value}`;
    }
  }

  return expanded;
}

function extractTextFromDescription(description: unknown): string {
  if (!description) return '';
  if (typeof description === 'string') {
    try {
      const parsed = JSON.parse(description);
      return extractTextFromTipTap(parsed);
    } catch {
      return description;
    }
  }
  return extractTextFromTipTap(description);
}

function extractTextFromTipTap(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;

  if (n.type === 'text' && typeof n.text === 'string') {
    return n.text;
  }

  if (Array.isArray(n.content)) {
    return n.content.map(extractTextFromTipTap).join(' ').trim();
  }

  return '';
}

function getPriorityLabel(priority: string | null): string {
  switch (priority) {
    case 'low':
      return 'Low';
    case 'normal':
      return 'Normal';
    case 'high':
      return 'High';
    case 'critical':
      return 'Critical';
    default:
      return 'None';
  }
}

// Visualization tool handlers

async function visualizeTaskList(
  normalizedWsId: string,
  userId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  let taskIds = (args.taskIds as string[]) || [];
  const title = (args.title as string) || 'Tasks';
  const category = args.category as string | undefined;

  // If no task IDs provided, fetch tasks based on category
  if (taskIds.length === 0) {
    const { data: rpcTasks, error: rpcError } = await supabase.rpc(
      'get_user_accessible_tasks',
      {
        p_user_id: userId,
        p_ws_id: normalizedWsId,
        p_include_deleted: false,
        p_list_statuses: ['not_started', 'active', 'done'],
      }
    );

    if (rpcError) {
      return {
        action: 'visualize_task_list',
        error: rpcError.message,
      };
    }

    // Filter tasks based on category
    const now = new Date().toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    today.setHours(23, 59, 59, 999);
    const todayEnd = today.toISOString();

    type RpcTaskBasic = {
      task_id: string;
      task_end_date: string | null;
      task_completed_at: string | null;
      task_closed_at: string | null;
    };

    const activeTasks = (rpcTasks || []).filter(
      (t: RpcTaskBasic) => !t.task_completed_at && !t.task_closed_at
    );

    let filteredTasks: RpcTaskBasic[];
    if (category === 'overdue') {
      filteredTasks = activeTasks.filter(
        (t: RpcTaskBasic) => t.task_end_date && t.task_end_date < now
      );
    } else if (category === 'today') {
      filteredTasks = activeTasks.filter(
        (t: RpcTaskBasic) =>
          t.task_end_date &&
          t.task_end_date >= todayStart &&
          t.task_end_date <= todayEnd
      );
    } else if (category === 'upcoming') {
      filteredTasks = activeTasks.filter(
        (t: RpcTaskBasic) => !t.task_end_date || t.task_end_date > todayEnd
      );
    } else {
      // Default to all active tasks
      filteredTasks = activeTasks;
    }

    taskIds = filteredTasks.slice(0, 50).map((t: RpcTaskBasic) => t.task_id);

    if (taskIds.length === 0) {
      return {
        action: 'visualize_task_list',
        taskCount: 0,
        tasks: [],
        message: `No ${category || 'active'} tasks found.`,
        visualization: {
          type: 'task_list' as const,
          data: {
            title,
            category: category as
              | 'overdue'
              | 'today'
              | 'upcoming'
              | 'search_results'
              | undefined,
            tasks: [],
          },
        },
      };
    }
  }

  // Fetch task details for the given IDs
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(
      `
      id, name, priority, end_date, completed_at,
      task_assignees(users(display_name, avatar_url))
    `
    )
    .in('id', taskIds)
    .is('deleted_at', null);

  if (error) {
    return {
      action: 'visualize_task_list',
      error: error.message,
    };
  }

  const mappedTasks = (tasks || []).map((task) => ({
    id: task.id,
    name: task.name,
    priority: task.priority,
    priorityLabel: getPriorityLabel(task.priority),
    endDate: task.end_date,
    completed: !!task.completed_at,
    assignees: ((task.task_assignees as unknown[]) || []).map((ta: unknown) => {
      const assignee = ta as {
        users?: { display_name?: string; avatar_url?: string };
      };
      return {
        name: assignee.users?.display_name || 'Unknown',
        avatarUrl: assignee.users?.avatar_url,
      };
    }),
  }));

  return {
    action: 'visualize_task_list',
    // Include task data at top level for AI to read
    taskCount: mappedTasks.length,
    tasks: mappedTasks,
    visualization: {
      type: 'task_list' as const,
      data: {
        title,
        category: category as
          | 'overdue'
          | 'today'
          | 'upcoming'
          | 'search_results'
          | undefined,
        tasks: mappedTasks,
      },
    },
  };
}

async function visualizeTimeline(
  normalizedWsId: string,
  userId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  let taskIds = (args.taskIds as string[]) || [];
  const title = (args.title as string) || 'Timeline';
  const timeRange = (args.timeRange as string) || 'month';

  // If no task IDs provided, fetch tasks with dates
  if (taskIds.length === 0) {
    const { data: rpcTasks, error: rpcError } = await supabase.rpc(
      'get_user_accessible_tasks',
      {
        p_user_id: userId,
        p_ws_id: normalizedWsId,
        p_include_deleted: false,
        p_list_statuses: ['not_started', 'active', 'done'],
      }
    );

    if (rpcError) {
      return {
        action: 'visualize_timeline',
        error: rpcError.message,
      };
    }

    type RpcTaskWithDates = {
      task_id: string;
      task_start_date: string | null;
      task_end_date: string | null;
      task_completed_at: string | null;
      task_closed_at: string | null;
    };

    // Only include tasks that have at least one date set
    const tasksWithDates = (rpcTasks || []).filter(
      (t: RpcTaskWithDates) =>
        (t.task_start_date || t.task_end_date) &&
        !t.task_completed_at &&
        !t.task_closed_at
    );

    taskIds = tasksWithDates
      .slice(0, 50)
      .map((t: RpcTaskWithDates) => t.task_id);

    if (taskIds.length === 0) {
      // Return empty timeline with default range
      const now = new Date();
      return {
        action: 'visualize_timeline',
        taskCount: 0,
        tasks: [],
        message: 'No tasks with dates found.',
        visualization: {
          type: 'gantt_timeline' as const,
          data: {
            title,
            timeRange: {
              start: new Date(
                now.getFullYear(),
                now.getMonth(),
                1
              ).toISOString(),
              end: new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0
              ).toISOString(),
            },
            tasks: [],
          },
        },
      };
    }
  }

  // Fetch tasks with date info
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(
      `
      id, name, start_date, end_date, priority, completed_at,
      task_lists!inner(status)
    `
    )
    .in('id', taskIds)
    .is('deleted_at', null);

  if (error) {
    return {
      action: 'visualize_timeline',
      error: error.message,
    };
  }

  // Calculate time range
  const now = new Date();
  let rangeStart: Date;
  let rangeEnd: Date;

  if (timeRange === 'week') {
    rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay()); // Start of week
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 6); // End of week
  } else if (timeRange === 'month') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else {
    // "all" - find min/max dates from tasks
    const dates = (tasks || [])
      .flatMap((t) => [t.start_date, t.end_date])
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime());

    if (dates.length > 0) {
      rangeStart = new Date(Math.min(...dates));
      rangeEnd = new Date(Math.max(...dates));
    } else {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
  }

  const mappedTasks = (tasks || []).map((task) => ({
    id: task.id,
    name: task.name,
    startDate: task.start_date,
    endDate: task.end_date,
    status:
      (task.task_lists as unknown as { status?: string })?.status ||
      'not_started',
    priority: task.priority,
  }));

  return {
    action: 'visualize_timeline',
    // Include task data at top level for AI to read
    taskCount: mappedTasks.length,
    tasks: mappedTasks,
    visualization: {
      type: 'gantt_timeline' as const,
      data: {
        title,
        timeRange: {
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
        },
        tasks: mappedTasks,
      },
    },
  };
}

async function visualizeStatusBreakdown(
  normalizedWsId: string,
  userId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const title = (args.title as string) || 'Task Status';

  // Get all tasks for the workspace and count by status
  const { data: tasks, error } = await supabase.rpc(
    'get_user_accessible_tasks',
    {
      p_user_id: userId,
      p_ws_id: normalizedWsId,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active', 'done', 'closed'],
    }
  );

  if (error) {
    return {
      action: 'visualize_status_breakdown',
      error: error.message,
    };
  }

  // Count tasks by completion status
  // Note: The RPC filters by p_list_statuses, and we categorize based on completion state
  const counts = {
    not_started: 0,
    active: 0,
    done: 0,
    closed: 0,
  };

  interface StatusTask {
    task_completed_at: string | null;
    task_closed_at: string | null;
  }

  (tasks || []).forEach((task: StatusTask) => {
    if (task.task_completed_at) {
      counts.done++;
    } else if (task.task_closed_at) {
      counts.closed++;
    } else {
      // Tasks without completion/close dates are considered active
      counts.active++;
    }
  });

  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);

  return {
    action: 'visualize_status_breakdown',
    // Include data at top level for AI to read
    total,
    counts,
    summary: `${counts.done} done, ${counts.active} active, ${counts.not_started} not started, ${counts.closed} closed`,
    visualization: {
      type: 'status_distribution' as const,
      data: {
        title,
        total,
        counts,
      },
    },
  };
}

async function visualizeTaskDetail(
  normalizedWsId: string,
  args: Record<string, unknown>
) {
  const supabase = await createClient();
  const taskId = args.taskId as string;

  if (!taskId) {
    return {
      action: 'visualize_task_detail',
      error: 'No task ID provided',
    };
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .select(
      `
      id,
      name,
      description,
      priority,
      completed,
      completed_at,
      created_at,
      start_date,
      end_date,
      task_labels(workspace_task_labels(name, color)),
      task_assignees(users(display_name, avatar_url)),
      task_lists!inner(
        name,
        workspace_boards!inner(name, ws_id)
      )
    `
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .single();

  if (error || !task) {
    return {
      action: 'visualize_task_detail',
      error: 'Task not found',
    };
  }

  // Verify workspace
  const taskAny = task as unknown as {
    task_lists?: {
      name?: string;
      workspace_boards?: { name?: string; ws_id?: string };
    };
    task_labels?: Array<{
      workspace_task_labels?: { name?: string; color?: string };
    }>;
    task_assignees?: Array<{
      users?: { display_name?: string; avatar_url?: string };
    }>;
  };

  if (taskAny.task_lists?.workspace_boards?.ws_id !== normalizedWsId) {
    return {
      action: 'visualize_task_detail',
      error: 'Task does not belong to this workspace',
    };
  }

  const taskData = {
    id: task.id,
    name: task.name,
    description: task.description
      ? extractTextFromDescription(task.description)
      : null,
    priority: task.priority,
    priorityLabel: getPriorityLabel(task.priority),
    completed: !!task.completed_at,
    startDate: task.start_date,
    endDate: task.end_date,
    createdAt: task.created_at,
    board: taskAny.task_lists?.workspace_boards?.name,
    list: taskAny.task_lists?.name,
    labels: (taskAny.task_labels || []).map((tl) => ({
      name: tl.workspace_task_labels?.name || 'Unknown',
      color: tl.workspace_task_labels?.color || '#888888',
    })),
    assignees: (taskAny.task_assignees || []).map((ta) => ({
      name: ta.users?.display_name || 'Unknown',
      avatarUrl: ta.users?.avatar_url,
    })),
  };

  return {
    action: 'visualize_task_detail',
    // Include task data at top level for AI to read
    task: taskData,
    visualization: {
      type: 'task_detail' as const,
      data: taskData,
    },
  };
}
