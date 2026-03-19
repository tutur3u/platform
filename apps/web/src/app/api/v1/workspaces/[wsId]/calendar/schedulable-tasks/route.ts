import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TaskWithScheduling } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { fetchSchedulableTasksForWorkspace } from '@/lib/calendar/schedulable-tasks';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

type TaskEventRow = {
  task_id: string;
  scheduled_minutes: number | null;
  completed: boolean | null;
};

type DirectEventRow = {
  task_id: string | null;
  start_at: string;
  end_at: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId);

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const searchQuery = url.searchParams.get('q')?.trim();

    const { data: workspaceInfo, error: workspaceError } = await sbAdmin
      .from('workspaces')
      .select('personal')
      .eq('id', normalizedWsId)
      .maybeSingle();

    if (workspaceError) {
      return NextResponse.json(
        { error: 'Failed to resolve workspace mode' },
        { status: 500 }
      );
    }

    const tasks = await fetchSchedulableTasksForWorkspace({
      sbAdmin,
      wsId: normalizedWsId,
      userId: user.id,
      isPersonalWorkspace: Boolean(workspaceInfo?.personal),
      searchQuery,
    });

    const taskIds = tasks.map((task) => task.id).filter(Boolean);

    if (taskIds.length === 0) {
      return NextResponse.json({ tasks: [] as TaskWithScheduling[] });
    }

    const [junctionResult, directResult] = await Promise.all([
      (sbAdmin as any)
        .from('task_calendar_events')
        .select(
          `
          task_id,
          scheduled_minutes,
          completed,
          workspace_calendar_events!inner(ws_id)
        `
        )
        .in('task_id', taskIds)
        .eq('workspace_calendar_events.ws_id', normalizedWsId),
      sbAdmin
        .from('workspace_calendar_events')
        .select('task_id, start_at, end_at')
        .in('task_id', taskIds)
        .eq('ws_id', normalizedWsId)
        .not('task_id', 'is', null),
    ]);

    if (junctionResult.error) {
      console.error(
        'Error fetching task calendar events:',
        junctionResult.error
      );
    }

    if (directResult.error) {
      console.error(
        'Error fetching direct calendar events:',
        directResult.error
      );
    }

    const taskSchedulingMap = new Map<
      string,
      { scheduled_minutes: number; completed_minutes: number }
    >();

    ((junctionResult.data as TaskEventRow[] | null) ?? []).forEach((event) => {
      const current = taskSchedulingMap.get(event.task_id) ?? {
        scheduled_minutes: 0,
        completed_minutes: 0,
      };

      const scheduledMinutes = event.scheduled_minutes ?? 0;
      current.scheduled_minutes += scheduledMinutes;

      if (event.completed) {
        current.completed_minutes += scheduledMinutes;
      }

      taskSchedulingMap.set(event.task_id, current);
    });

    ((directResult.data as DirectEventRow[] | null) ?? []).forEach((event) => {
      if (!event.task_id) {
        return;
      }

      const startAt = new Date(event.start_at);
      const endAt = new Date(event.end_at);
      const scheduledMinutes = Math.round(
        (endAt.getTime() - startAt.getTime()) / 60000
      );

      const current = taskSchedulingMap.get(event.task_id);
      if (!current || current.scheduled_minutes === 0) {
        taskSchedulingMap.set(event.task_id, {
          scheduled_minutes: scheduledMinutes,
          completed_minutes: 0,
        });
      }
    });

    const tasksWithProgress = tasks.map((task) => {
      const scheduling = taskSchedulingMap.get(task.id) ?? {
        scheduled_minutes: 0,
        completed_minutes: 0,
      };
      return {
        ...task,
        scheduled_minutes: scheduling.scheduled_minutes,
        completed_minutes: scheduling.completed_minutes,
      } as TaskWithScheduling;
    });

    return NextResponse.json({ tasks: tasksWithProgress });
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/calendar/schedulable-tasks:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
