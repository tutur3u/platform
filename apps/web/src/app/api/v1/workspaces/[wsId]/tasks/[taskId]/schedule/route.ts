import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskWithScheduling } from '@tuturuuu/types';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { scheduleTask } from '@/lib/calendar/task-scheduler';

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

    // Fetch the task base fields (scheduling settings are per-user)
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

    // Load per-user scheduling settings
    const { data: settingsRow } = await (supabase as any)
      .from('task_user_scheduling_settings')
      .select(
        `
        total_duration,
        is_splittable,
        min_split_duration_minutes,
        max_split_duration_minutes,
        calendar_hours,
        auto_schedule
      `
      )
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();

    const settings = settingsRow as any;

    // Check if user has duration set
    if (!settings?.total_duration || settings.total_duration <= 0) {
      return NextResponse.json(
        {
          error:
            'Task has no duration set. Please set an estimated duration before scheduling.',
        },
        { status: 400 }
      );
    }
    if (!settings?.calendar_hours) {
      return NextResponse.json(
        {
          error:
            'Hour type is required. Please select an hour type before scheduling.',
        },
        { status: 400 }
      );
    }

    // Prepare task for scheduling
    // scheduleTask() handles re-optimization internally (removes future events, keeps past)
    const taskWithScheduling: TaskWithScheduling = {
      ...taskWithLists,
      total_duration: settings.total_duration,
      is_splittable: settings.is_splittable ?? false,
      min_split_duration_minutes: settings.min_split_duration_minutes ?? null,
      max_split_duration_minutes: settings.max_split_duration_minutes ?? null,
      calendar_hours: settings.calendar_hours,
      auto_schedule: settings.auto_schedule ?? false,
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

    return NextResponse.json({
      success: true,
      message: result.message,
      events: result.events,
      totalScheduledMinutes: result.totalScheduledMinutes,
      warning: result.warning,
      warnings: result.warning ? [result.warning] : [],
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

    // Fetch task base fields and verify it belongs to the specified workspace
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        name,
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

    // Fetch per-user scheduling settings for this task
    const { data: settingsRow } = await (supabase as any)
      .from('task_user_scheduling_settings')
      .select(
        `
        total_duration,
        is_splittable,
        min_split_duration_minutes,
        max_split_duration_minutes,
        calendar_hours,
        auto_schedule
      `
      )
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();

    const settings = settingsRow as any;

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
    const totalMinutes = (settings?.total_duration ?? 0) * 60;

    return NextResponse.json({
      task: {
        id: taskWithRelations.id,
        name: taskWithRelations.name,
        total_duration: settings?.total_duration ?? null,
        is_splittable: settings?.is_splittable ?? false,
        min_split_duration_minutes:
          settings?.min_split_duration_minutes ?? null,
        max_split_duration_minutes:
          settings?.max_split_duration_minutes ?? null,
        calendar_hours: settings?.calendar_hours ?? null,
        auto_schedule: settings?.auto_schedule ?? false,
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
