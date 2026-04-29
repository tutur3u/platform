import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TaskWithScheduling } from '@tuturuuu/types';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
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

async function hasWorkspaceAccess(supabase: any, wsId: string, userId: string) {
  const member = await verifyWorkspaceMembershipType({
    wsId,
    userId,
    supabase,
  });

  if (member.error === 'membership_lookup_failed') {
    throw new Error('Failed to verify workspace access');
  }

  return member.ok;
}

async function fetchTaskWithWorkspace(taskId: string) {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
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
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as
    | (Record<string, unknown> & {
        task_lists?: {
          id?: string;
          workspace_boards?: {
            ws_id?: string | null;
          } | null;
        } | null;
      })
    | null;
}

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
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to schedule tasks' },
        { status: 401 }
      );
    }

    const hasCalendarWorkspaceAccess = await hasWorkspaceAccess(
      supabase,
      wsId,
      user.id
    );

    if (!hasCalendarWorkspaceAccess) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const taskWithLists = await fetchTaskWithWorkspace(taskId);

    if (!taskWithLists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const taskWorkspaceId = taskWithLists.task_lists?.workspace_boards?.ws_id;
    if (!taskWorkspaceId) {
      return NextResponse.json(
        { error: 'Task workspace not found' },
        { status: 404 }
      );
    }

    if (taskWorkspaceId !== wsId) {
      const hasTaskWorkspaceAccess = await hasWorkspaceAccess(
        supabase,
        taskWorkspaceId,
        user.id
      );

      if (!hasTaskWorkspaceAccess) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
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
    const taskWithScheduling = {
      ...taskWithLists,
      total_duration: settings.total_duration,
      is_splittable: settings.is_splittable ?? false,
      min_split_duration_minutes: settings.min_split_duration_minutes ?? null,
      max_split_duration_minutes: settings.max_split_duration_minutes ?? null,
      calendar_hours: settings.calendar_hours,
      auto_schedule: settings.auto_schedule ?? false,
    } as TaskWithScheduling;

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
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view task schedule' },
        { status: 401 }
      );
    }

    const hasCalendarWorkspaceAccess = await hasWorkspaceAccess(
      supabase,
      wsId,
      user.id
    );

    if (!hasCalendarWorkspaceAccess) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const taskWithRelations = await fetchTaskWithWorkspace(taskId);

    if (!taskWithRelations) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const taskWorkspaceId =
      taskWithRelations.task_lists?.workspace_boards?.ws_id;
    if (!taskWorkspaceId) {
      return NextResponse.json(
        { error: 'Task workspace not found' },
        { status: 404 }
      );
    }

    if (taskWorkspaceId !== wsId) {
      const hasTaskWorkspaceAccess = await hasWorkspaceAccess(
        supabase,
        taskWorkspaceId,
        user.id
      );

      if (!hasTaskWorkspaceAccess) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
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

    const [{ data: taskEvents }, { data: directEvents }] = await Promise.all([
      (sbAdmin as any)
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
        .eq('task_id', taskId),
      sbAdmin
        .from('workspace_calendar_events')
        .select('id, title, start_at, end_at, color')
        .eq('task_id', taskId)
        .eq('ws_id', wsId),
    ]);

    const typedEvents = (taskEvents as TaskCalendarEventRow[] | null) ?? [];

    // Calculate real duration based on event times to ensure accuracy
    const eventsWithRealDuration = typedEvents.map((te) => {
      const ev = te.workspace_calendar_events;
      if (ev?.start_at && ev.end_at) {
        const start = new Date(ev.start_at).getTime();
        const end = new Date(ev.end_at).getTime();
        const duration = Math.round((end - start) / 60000);
        return { ...te, scheduled_minutes: duration };
      }
      return { ...te, scheduled_minutes: 0 };
    });

    const existingEventIds = new Set(
      eventsWithRealDuration
        .map((event) => event.workspace_calendar_events?.id)
        .filter(Boolean)
    );

    const fallbackEvents = (directEvents || [])
      .filter((event) => !existingEventIds.has(event.id))
      .map((event) => ({
        workspace_calendar_events: event,
        scheduled_minutes: Math.round(
          (new Date(event.end_at).getTime() -
            new Date(event.start_at).getTime()) /
            60000
        ),
        completed: false,
      }));

    const combinedEvents = [...eventsWithRealDuration, ...fallbackEvents];

    const scheduledMinutes = combinedEvents.reduce(
      (sum, e) => sum + e.scheduled_minutes,
      0
    );
    const completedMinutes = combinedEvents.reduce(
      (sum, e) => sum + (e.completed ? e.scheduled_minutes : 0),
      0
    );
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
        combinedEvents.map((te) => ({
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
