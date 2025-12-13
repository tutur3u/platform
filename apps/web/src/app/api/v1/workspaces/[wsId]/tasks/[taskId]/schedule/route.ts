import {
  rescheduleAllAutoScheduleTasks,
  scheduleTask,
} from '@/lib/calendar/task-scheduler';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskWithScheduling } from '@tuturuuu/types';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface ScheduleParams {
  wsId: string;
  taskId: string;
}

// Type definitions for task_calendar_events table (pending migration)
type TaskCalendarEventRow = {
  task_id: string;
  event_id: string;
  scheduled_minutes: number;
  completed: boolean;
  created_at?: string;
  workspace_calendar_events?: {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    color: string;
  };
};

export async function POST(
  _: NextRequest,
  { params }: { params: Promise<ScheduleParams> }
) {
  try {
    const { wsId, taskId } = await params;

    // Validate UUIDs
    if (!validate(wsId) || !validate(taskId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to schedule tasks' },
        { status: 401 }
      );
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Fetch the task with scheduling fields
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(
        `
        *,
        task_lists!inner (
          id,
          workspace_boards!inner (
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Verify task belongs to the specified workspace
    // Using type assertion due to nested relation types
    const taskWithLists = task as any;
    if (taskWithLists.task_lists?.workspace_boards?.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Task does not belong to this workspace' },
        { status: 403 }
      );
    }

    // Check if task has duration set
    if (!taskWithLists.total_duration || taskWithLists.total_duration <= 0) {
      return NextResponse.json(
        {
          error:
            'Task has no duration set. Please set an estimated duration before scheduling.',
        },
        { status: 400 }
      );
    }

    // Prepare task for scheduling
    // scheduleTask() handles re-optimization internally (removes future events, keeps past)
    const taskWithScheduling: TaskWithScheduling = {
      ...taskWithLists,
      // start_date, end_date, and priority are included from the * select
    };

    // Schedule the task
    const result = await scheduleTask(
      supabase as any,
      wsId,
      taskWithScheduling
    );

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    // Reschedule ALL auto-schedule tasks (including the current one) in deadline order
    // This ensures optimal calendar distribution - tasks with earlier deadlines get earlier slots
    const rescheduleResult = await rescheduleAllAutoScheduleTasks(
      supabase as any,
      wsId
    );

    // Combine warnings from both operations
    const allWarnings = [
      ...(result.warning ? [result.warning] : []),
      ...rescheduleResult.warnings,
    ].filter(Boolean);

    return NextResponse.json({
      success: true,
      message: result.message,
      events: result.events,
      totalScheduledMinutes: result.totalScheduledMinutes,
      warning: allWarnings.length > 0 ? allWarnings.join('; ') : undefined,
      warnings: allWarnings,
      rescheduledOtherTasks: rescheduleResult.rescheduledCount,
    });
  } catch (error) {
    console.error('Error scheduling task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<ScheduleParams> }
) {
  try {
    const { wsId, taskId } = await params;

    // Validate UUIDs
    if (!validate(wsId) || !validate(taskId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view task schedule' },
        { status: 401 }
      );
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Fetch task with scheduling fields
    // Note: auto_schedule column requires migration to be applied
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        name,
        total_duration,
        is_splittable,
        min_split_duration_minutes,
        max_split_duration_minutes,
        calendar_hours,
        task_lists!inner (
          workspace_boards!inner (
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Using type assertion for nested relations
    const taskWithRelations = task as any;

    // Verify task belongs to the specified workspace
    if (taskWithRelations.task_lists?.workspace_boards?.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Task does not belong to this workspace' },
        { status: 403 }
      );
    }

    // Fetch scheduled events for this task
    // Note: task_calendar_events table requires migration to be applied
    const { data: taskEvents } = await (supabase as any)
      .from('task_calendar_events')
      .select(
        `
        id,
        scheduled_minutes,
        completed,
        created_at,
        workspace_calendar_events (
          id,
          title,
          start_at,
          end_at,
          color
        )
      `
      )
      .eq('task_id', taskId);

    const typedEvents = taskEvents as TaskCalendarEventRow[] | null;
    const scheduledMinutes =
      typedEvents?.reduce((sum, e) => sum + (e.scheduled_minutes || 0), 0) ?? 0;
    const completedMinutes =
      typedEvents?.reduce(
        (sum, e) => sum + (e.completed ? e.scheduled_minutes || 0 : 0),
        0
      ) ?? 0;
    const totalMinutes = (taskWithRelations.total_duration ?? 0) * 60;

    return NextResponse.json({
      task: {
        id: taskWithRelations.id,
        name: taskWithRelations.name,
        total_duration: taskWithRelations.total_duration,
        is_splittable: taskWithRelations.is_splittable,
        min_split_duration_minutes:
          taskWithRelations.min_split_duration_minutes,
        max_split_duration_minutes:
          taskWithRelations.max_split_duration_minutes,
        calendar_hours: taskWithRelations.calendar_hours,
        auto_schedule: taskWithRelations.auto_schedule ?? false,
      },
      scheduling: {
        totalMinutes,
        scheduledMinutes,
        completedMinutes,
        remainingMinutes: Math.max(0, totalMinutes - scheduledMinutes),
        progress:
          totalMinutes > 0 ? (scheduledMinutes / totalMinutes) * 100 : 0,
        isFullyScheduled: scheduledMinutes >= totalMinutes,
      },
      events:
        typedEvents?.map((te) => ({
          id: te.workspace_calendar_events?.id,
          title: te.workspace_calendar_events?.title,
          start_at: te.workspace_calendar_events?.start_at,
          end_at: te.workspace_calendar_events?.end_at,
          color: te.workspace_calendar_events?.color,
          scheduled_minutes: te.scheduled_minutes,
          completed: te.completed,
        })) ?? [],
    });
  } catch (error) {
    console.error('Error fetching task schedule:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
