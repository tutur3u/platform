/**
 * Tuna Task Complete API
 * POST /api/v1/tuna/tasks/complete - Complete a task and award XP
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const completeTaskSchema = z.object({
  task_id: z.string().uuid(),
});

// XP calculation constants
const BASE_TASK_XP = 10;
const OVERDUE_BONUS_XP = 5;

const PRIORITY_MULTIPLIERS: Record<string, number> = {
  critical: 2.0,
  high: 1.5,
  normal: 1.0,
  low: 0.75,
};

function calculateTaskXp(priority: string, isOverdue: boolean): number {
  const multiplier = PRIORITY_MULTIPLIERS[priority] ?? 1.0;
  let xp = Math.ceil(BASE_TASK_XP * multiplier);

  if (isOverdue) {
    xp += OVERDUE_BONUS_XP;
  }

  return xp;
}

interface RpcTask {
  task_id: string;
  task_name: string;
  task_description: string | null;
  task_priority: string;
  task_end_date: string | null;
  task_list_id: string | null;
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = completeTaskSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { task_id } = parsed.data;

    // Check if user has access to this task (via assignment or workspace membership)
    const { data: accessibleTasks } = await supabase.rpc(
      'get_user_accessible_tasks',
      {
        p_user_id: user.id,
        p_ws_id: undefined,
        p_include_deleted: false,
        p_list_statuses: ['not_started', 'active'],
      }
    );

    const taskFromRpc = ((accessibleTasks as RpcTask[]) || []).find(
      (t) => t.task_id === task_id
    );

    if (!taskFromRpc) {
      return NextResponse.json(
        { error: 'Task not found or you do not have access' },
        { status: 404 }
      );
    }

    // Get list and board info
    let listInfo: TaskList | null = null;
    if (taskFromRpc.task_list_id) {
      const { data: listData } = await supabase
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
        .eq('id', taskFromRpc.task_list_id)
        .maybeSingle();
      listInfo = listData as unknown as TaskList;
    }

    // Find a "done" or "closed" list to move the task to
    let doneListId: string | null = null;
    if (listInfo?.board?.id) {
      const { data: boardLists } = await supabase
        .from('task_lists')
        .select('id, status, position')
        .eq('board_id', listInfo.board.id)
        .eq('deleted', false)
        .order('position');

      const doneList = boardLists?.find((l) => l.status === 'done');
      const closedList = boardLists?.find((l) => l.status === 'closed');
      doneListId = doneList?.id || closedList?.id || null;
    }

    // Calculate XP based on priority and whether it was overdue
    const isOverdue =
      taskFromRpc.task_end_date &&
      new Date(taskFromRpc.task_end_date) < new Date();
    const xpEarned = calculateTaskXp(
      taskFromRpc.task_priority || 'normal',
      !!isOverdue
    );

    // Move task to done list - the database trigger handles completed_at/closed_at automatically
    const now = new Date().toISOString();
    if (doneListId && doneListId !== taskFromRpc.task_list_id) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ list_id: doneListId })
        .eq('id', task_id);

      if (updateError) {
        console.error('Error completing task:', updateError);
        return NextResponse.json(
          { error: 'Failed to complete task' },
          { status: 500 }
        );
      }
    } else {
      // No done/closed list found, manually set completed_at as fallback
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ completed_at: now })
        .eq('id', task_id);

      if (updateError) {
        console.error('Error completing task:', updateError);
        return NextResponse.json(
          { error: 'Failed to complete task' },
          { status: 500 }
        );
      }
    }

    // Get current pet state for level comparison
    const { data: beforePet } = await supabase
      .from('tuna_pets')
      .select('level')
      .eq('user_id', user.id)
      .single();

    const beforeLevel = beforePet?.level || 1;

    // Award XP using database function
    const { data: pet, error: xpError } = await supabase.rpc('award_tuna_xp', {
      p_user_id: user.id,
      p_xp: xpEarned,
      p_source: 'task_completion',
    });

    if (xpError) {
      console.error('Error awarding XP:', xpError);
      // Task is completed, but XP failed - log but don't fail the request
    }

    // Update daily stats for tasks_completed
    const today = now.split('T')[0] ?? '';
    const { data: existingStats } = await supabase
      .from('tuna_daily_stats')
      .select('id, tasks_completed')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (existingStats) {
      await supabase
        .from('tuna_daily_stats')
        .update({
          tasks_completed: (existingStats.tasks_completed || 0) + 1,
          updated_at: now,
        })
        .eq('id', existingStats.id);
    } else {
      await supabase.from('tuna_daily_stats').insert({
        user_id: user.id,
        date: today,
        tasks_completed: 1,
      });
    }

    const leveledUp = pet && pet.level > beforeLevel;

    return NextResponse.json({
      task: {
        id: task_id,
        name: taskFromRpc.task_name,
        description: taskFromRpc.task_description,
        priority: taskFromRpc.task_priority || 'normal',
        end_date: taskFromRpc.task_end_date,
        list_id: taskFromRpc.task_list_id,
        list_name: listInfo?.name ?? null,
        board_id: listInfo?.board?.id ?? null,
        board_name: listInfo?.board?.name ?? null,
        ws_id: listInfo?.board?.ws_id ?? null,
      },
      pet: pet || null,
      xp_earned: xpEarned,
      leveled_up: !!leveledUp,
      ...(leveledUp && { new_level: pet?.level }),
    });
  } catch (error) {
    console.error(
      'Unexpected error in POST /api/v1/tuna/tasks/complete:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
