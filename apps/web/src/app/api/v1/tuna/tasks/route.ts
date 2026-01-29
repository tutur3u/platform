/**
 * Tuna Tasks API
 * GET /api/v1/tuna/tasks - Get user's tasks categorized by due date
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface RpcTask {
  task_id: string;
  task_name: string;
  task_description: string | null;
  task_priority: string;
  task_end_date: string | null;
  task_list_id: string | null;
  task_completed_at: string | null;
  task_closed_at: string | null;
  task_deleted_at: string | null;
  task_created_at: string | null;
}

interface TaskList {
  id: string;
  name: string;
  status: string;
  board: {
    id: string;
    name: string;
    ws_id: string;
  } | null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wsId = searchParams.get('wsId');
    const isPersonal = searchParams.get('isPersonal') === 'true';

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Match the tasks page behavior:
    // - For personal workspaces: fetch ALL tasks across all workspaces (p_ws_id = undefined)
    // - For team workspaces: fetch tasks only for that workspace
    const workspaceFilter = isPersonal ? undefined : wsId || undefined;

    // Fetch accessible tasks using the RPC function
    // Match the tasks page: include 'done' list status to get all tasks
    const { data: rpcTasks, error: tasksError } = await supabase.rpc(
      'get_user_accessible_tasks',
      {
        p_user_id: user.id,
        p_ws_id: workspaceFilter,
        p_include_deleted: false,
        p_list_statuses: ['not_started', 'active', 'done'],
      }
    );

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return NextResponse.json(
        { error: 'Failed to fetch tasks' },
        { status: 500 }
      );
    }

    // Get unique list IDs to fetch list/board info
    const listIds = [
      ...new Set(
        ((rpcTasks as RpcTask[]) || [])
          .map((t) => t.task_list_id)
          .filter((id): id is string => id !== null)
      ),
    ];

    // Fetch list and board data
    const listsMap = new Map<string, TaskList>();
    if (listIds.length > 0) {
      const { data: listsData } = await supabase
        .from('task_lists')
        .select(
          `
          id,
          name,
          status,
          board:workspace_boards!inner(
            id,
            name,
            ws_id
          )
        `
        )
        .in('id', listIds);

      if (listsData) {
        for (const list of listsData as unknown as TaskList[]) {
          listsMap.set(list.id, list);
        }
      }
    }

    // Map tasks to the simplified format (include list_status for filtering)
    // Note: We do NOT filter out closed/deleted tasks here to match the Tasks page behavior.
    // The RPC function already handles p_include_deleted: false.
    const tasks = ((rpcTasks as RpcTask[]) || []).map((task) => {
      const list = task.task_list_id ? listsMap.get(task.task_list_id) : null;
      return {
        id: task.task_id,
        name: task.task_name,
        description: task.task_description,
        priority: task.task_priority || 'normal',
        end_date: task.task_end_date,
        created_at: task.task_created_at,
        list_id: task.task_list_id,
        list_name: list?.name ?? null,
        list_status: list?.status ?? null,
        board_id: list?.board?.id ?? null,
        board_name: list?.board?.name ?? null,
        ws_id: list?.board?.ws_id ?? null,
      };
    });

    // Filter helper to match tasks page behavior:
    // Only include tasks from lists with 'not_started' or 'active' status
    const isActiveListTask = (task: (typeof tasks)[number]) =>
      task.list_status && ['not_started', 'active'].includes(task.list_status);

    // Categorize tasks by due date
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const nextWeekEnd = new Date(now);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
    nextWeekEnd.setHours(23, 59, 59, 999);

    const overdue = tasks
      .filter(
        (task) =>
          task.end_date &&
          new Date(task.end_date) < now &&
          isActiveListTask(task)
      )
      .sort(
        (a, b) =>
          new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime()
      );

    const today = tasks
      .filter((task) => {
        if (!task.end_date || !isActiveListTask(task)) return false;
        const endDate = new Date(task.end_date);
        return endDate >= todayStart && endDate <= todayEnd && endDate >= now;
      })
      .sort(
        (a, b) =>
          new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime()
      );

    // Tasks with due dates in the upcoming week
    const upcomingWithDateTasks = tasks
      .filter((task) => {
        if (!task.end_date || !isActiveListTask(task)) return false;
        const endDate = new Date(task.end_date);
        return endDate > todayEnd && endDate <= nextWeekEnd;
      })
      .sort(
        (a, b) =>
          new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime()
      );

    // Tasks without due dates - sorted by priority then by created_at (newest first)
    // This matches the Tasks page behavior where no-due-date tasks are included in "upcoming"
    const noDueDateTasks = tasks
      .filter((task) => !task.end_date && isActiveListTask(task))
      .sort((a, b) => {
        // First sort by priority (critical > high > normal > low)
        const priorityOrder: Record<string, number> = {
          critical: 4,
          high: 3,
          normal: 2,
          low: 1,
        };
        const aPriority = priorityOrder[a.priority] || 2;
        const bPriority = priorityOrder[b.priority] || 2;
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        // Then by created_at (newest first)
        if (a.created_at && b.created_at) {
          return a.created_at > b.created_at ? -1 : 1;
        }
        return 0;
      });

    // Merge upcoming tasks with no-due-date tasks (matches Tasks page behavior)
    const upcoming = [...upcomingWithDateTasks, ...noDueDateTasks];

    // Get today's completed tasks count from daily stats
    const todayStr = now.toISOString().split('T')[0] ?? '';
    const { data: dailyStats } = await supabase
      .from('tuna_daily_stats')
      .select('tasks_completed')
      .eq('user_id', user.id)
      .eq('date', todayStr)
      .maybeSingle();

    return NextResponse.json({
      overdue,
      today,
      upcoming,
      stats: {
        total: overdue.length + today.length + upcoming.length,
        completed_today: dailyStats?.tasks_completed ?? 0,
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/v1/tuna/tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
