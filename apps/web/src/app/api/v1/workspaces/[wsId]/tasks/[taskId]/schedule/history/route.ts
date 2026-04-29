import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';

const querySchema = z.object({
  start: z.string().date().optional(),
  end: z.string().date().optional(),
});

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
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as
    | (Record<string, unknown> & {
        id?: string;
        name?: string | null;
        task_lists?: {
          workspace_boards?: {
            ws_id?: string | null;
          } | null;
        } | null;
      })
    | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const { wsId, taskId } = await params;

    if (!validate(wsId) || !validate(taskId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasCalendarWorkspaceAccess = await hasWorkspaceAccess(
      supabase,
      wsId,
      user.id
    );

    if (!hasCalendarWorkspaceAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const task = await fetchTaskWithWorkspace(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const taskWorkspaceId = task.task_lists?.workspace_boards?.ws_id;
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

    const parsedQuery = querySchema.safeParse({
      start: new URL(request.url).searchParams.get('start') ?? undefined,
      end: new URL(request.url).searchParams.get('end') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: parsedQuery.error.issues },
        { status: 400 }
      );
    }

    const now = new Date();
    const rangeStart = parsedQuery.data.start
      ? new Date(`${parsedQuery.data.start}T00:00:00.000Z`)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const rangeEnd = parsedQuery.data.end
      ? new Date(`${parsedQuery.data.end}T23:59:59.999Z`)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [settingsResult, junctionResult, directResult] = await Promise.all([
      (supabase as any)
        .from('task_user_scheduling_settings')
        .select('total_duration')
        .eq('task_id', taskId)
        .eq('user_id', user.id)
        .maybeSingle(),
      (sbAdmin as any)
        .from('task_calendar_events')
        .select(
          `
          scheduled_minutes,
          workspace_calendar_events!inner (
            id,
            start_at,
            end_at,
            ws_id
          )
        `
        )
        .eq('task_id', taskId)
        .eq('workspace_calendar_events.ws_id', wsId)
        .gte('workspace_calendar_events.start_at', rangeStart.toISOString())
        .lte('workspace_calendar_events.start_at', rangeEnd.toISOString()),
      sbAdmin
        .from('workspace_calendar_events')
        .select('id, start_at, end_at, ws_id')
        .eq('task_id', taskId)
        .eq('ws_id', wsId)
        .gte('start_at', rangeStart.toISOString())
        .lte('start_at', rangeEnd.toISOString()),
    ]);

    const entriesByEventId = new Map<
      string,
      {
        event_id: string | null;
        date: string;
        start_at: string | null;
        end_at: string | null;
        scheduled_minutes: number;
        status: 'completed' | 'scheduled' | 'trimmed';
      }
    >();

    for (const row of (junctionResult.data as any[] | null) ?? []) {
      const event = row.workspace_calendar_events;
      if (!event?.id) continue;
      const actualMinutes = Math.max(
        0,
        Math.round(
          (new Date(event.end_at).getTime() -
            new Date(event.start_at).getTime()) /
            60000
        )
      );
      const scheduledMinutes = row.scheduled_minutes ?? actualMinutes;
      const hasEnded = new Date(event.end_at).getTime() <= now.getTime();
      entriesByEventId.set(event.id, {
        event_id: event.id,
        date: event.start_at.split('T')[0] ?? '',
        start_at: event.start_at,
        end_at: event.end_at,
        scheduled_minutes: actualMinutes,
        status:
          hasEnded && scheduledMinutes !== actualMinutes
            ? 'trimmed'
            : hasEnded
              ? 'completed'
              : 'scheduled',
      });
    }

    for (const row of (directResult.data as any[] | null) ?? []) {
      if (!row.id || entriesByEventId.has(row.id)) continue;
      const actualMinutes = Math.max(
        0,
        Math.round(
          (new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) /
            60000
        )
      );
      const hasEnded = new Date(row.end_at).getTime() <= now.getTime();
      entriesByEventId.set(row.id, {
        event_id: row.id,
        date: row.start_at.split('T')[0] ?? '',
        start_at: row.start_at,
        end_at: row.end_at,
        scheduled_minutes: actualMinutes,
        status: hasEnded ? 'completed' : 'scheduled',
      });
    }

    const entries = [...entriesByEventId.values()].sort((left, right) =>
      (left.start_at ?? '').localeCompare(right.start_at ?? '')
    );
    const scheduledMinutes = entries.reduce(
      (sum, entry) => sum + entry.scheduled_minutes,
      0
    );
    const totalMinutes = Math.max(
      0,
      Math.round(((settingsResult.data as any)?.total_duration ?? 0) * 60)
    );

    return NextResponse.json({
      entries,
      summary: {
        totalMinutes,
        scheduledMinutes,
        remainingMinutes: Math.max(0, totalMinutes - scheduledMinutes),
      },
    });
  } catch (error) {
    console.error('Error fetching task schedule history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
