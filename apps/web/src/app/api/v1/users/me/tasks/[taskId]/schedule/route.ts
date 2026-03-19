import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TaskWithScheduling } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { withSessionAuth } from '@/lib/api-auth';
import { scheduleTask } from '@/lib/calendar/task-scheduler';

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
    ws_id: string;
  };
};

async function getPersonalWorkspaceId(
  supabase: TypedSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, workspace_members!inner(user_id)')
    .eq('workspace_members.user_id', userId)
    .eq('personal', true)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id;
}

async function getTaskWorkspaceId(taskId: string): Promise<string | null> {
  const sbAdmin = await createAdminClient();
  const { data } = await sbAdmin
    .from('tasks')
    .select(
      `
      id,
      task_lists!inner (
        workspace_boards!inner (
          ws_id
        )
      )
    `
    )
    .eq('id', taskId)
    .single();

  const anyData = data;
  return anyData?.task_lists?.workspace_boards?.ws_id ?? null;
}

async function fetchUserSchedulingSettings(
  supabase: TypedSupabaseClient,
  taskId: string,
  userId: string
) {
  const { data } = await supabase
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
    .eq('user_id', userId)
    .maybeSingle();

  return data as {
    total_duration: number | null;
    is_splittable: boolean | null;
    min_split_duration_minutes: number | null;
    max_split_duration_minutes: number | null;
    calendar_hours: string | null;
    auto_schedule: boolean | null;
  } | null;
}

export const GET = withSessionAuth<{ taskId: string }>(
  async (_req, { user, supabase }, { taskId }) => {
    try {
      const sbAdmin = await createAdminClient();
      if (!validate(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const personalWsId = await getPersonalWorkspaceId(supabase, user.id);
      if (!personalWsId) {
        return NextResponse.json(
          { error: 'Personal workspace not found' },
          { status: 404 }
        );
      }

      const taskWsId = await getTaskWorkspaceId(taskId);
      if (!taskWsId) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      // Verify user can access the task's workspace (task may belong to a different workspace)
      const { data: memberCheck } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', taskWsId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!memberCheck) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      // Fetch base task fields (shared, non-scheduling)
      const { data: task, error: taskError } = await sbAdmin
        .from('tasks')
        .select(
          `
        id,
        name
      `
        )
        .eq('id', taskId)
        .single();

      if (taskError || !task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const userSettings = await fetchUserSchedulingSettings(
        supabase,
        taskId,
        user.id
      );

      const effective = {
        total_duration: userSettings?.total_duration ?? null,
        is_splittable: userSettings?.is_splittable ?? false,
        min_split_duration_minutes:
          userSettings?.min_split_duration_minutes ?? null,
        max_split_duration_minutes:
          userSettings?.max_split_duration_minutes ?? null,
        calendar_hours: (userSettings?.calendar_hours ?? null) as any,
        auto_schedule: userSettings?.auto_schedule ?? false,
      };

      const [{ data: taskEvents }, { data: directEvents }] = await Promise.all([
        sbAdmin
          .from('task_calendar_events')
          .select(
            `
          scheduled_minutes,
          completed,
          workspace_calendar_events (
            id,
            title,
            start_at,
            end_at,
            color,
            ws_id
          )
        `
          )
          .eq('task_id', taskId)
          .eq('workspace_calendar_events.ws_id', personalWsId),
        sbAdmin
          .from('workspace_calendar_events')
          .select('id, title, start_at, end_at, color')
          .eq('task_id', taskId)
          .eq('ws_id', personalWsId),
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

      const totalMinutes = (effective.total_duration ?? 0) * 60;

      return NextResponse.json({
        calendar_ws_id: personalWsId,
        task_ws_id: taskWsId,
        task: {
          id: task.id,
          name: task.name,
          total_duration: effective.total_duration,
          is_splittable: effective.is_splittable,
          min_split_duration_minutes: effective.min_split_duration_minutes,
          max_split_duration_minutes: effective.max_split_duration_minutes,
          calendar_hours: effective.calendar_hours,
          auto_schedule: effective.auto_schedule,
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
      console.error('Error fetching personal task schedule:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 5, swr: 10 } }
);

export const POST = withSessionAuth<{ taskId: string }>(
  async (_req, { user, supabase }, { taskId }) => {
    try {
      if (!validate(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const personalWsId = await getPersonalWorkspaceId(supabase, user.id);
      if (!personalWsId) {
        return NextResponse.json(
          { error: 'Personal workspace not found' },
          { status: 404 }
        );
      }

      const taskWsId = await getTaskWorkspaceId(taskId);
      if (!taskWsId) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const { data: memberCheck } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', taskWsId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!memberCheck) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const sbAdmin = await createAdminClient();

      // Fetch base task fields (shared, non-scheduling)
      const { data: task, error: taskError } = await sbAdmin
        .from('tasks')
        .select(
          `
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

      const userSettings = await fetchUserSchedulingSettings(
        supabase,
        taskId,
        user.id
      );
      const taskAny = task as any;

      if (!userSettings) {
        return NextResponse.json(
          {
            error:
              'No personal scheduling settings found. Please configure duration and hour type first.',
          },
          { status: 400 }
        );
      }

      // Build TaskWithScheduling from per-user settings
      const taskWithScheduling: TaskWithScheduling = {
        ...taskAny,
        total_duration: userSettings.total_duration ?? null,
        is_splittable: userSettings.is_splittable ?? false,
        min_split_duration_minutes:
          userSettings.min_split_duration_minutes ?? null,
        max_split_duration_minutes:
          userSettings.max_split_duration_minutes ?? null,
        calendar_hours: (userSettings.calendar_hours ?? null) as any,
        auto_schedule: userSettings.auto_schedule ?? false,
      };

      if (
        !taskWithScheduling.total_duration ||
        taskWithScheduling.total_duration <= 0
      ) {
        return NextResponse.json(
          {
            error:
              'Task has no duration set. Please set your scheduling estimate before scheduling.',
          },
          { status: 400 }
        );
      }
      if (!taskWithScheduling.calendar_hours) {
        return NextResponse.json(
          {
            error:
              'Hour type is required. Please select an hour type before scheduling.',
          },
          { status: 400 }
        );
      }

      const result = await scheduleTask(
        supabase as any,
        personalWsId,
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
        calendar_ws_id: personalWsId,
        task_ws_id: taskWsId,
      });
    } catch (error) {
      console.error('Error scheduling task in personal workspace:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
