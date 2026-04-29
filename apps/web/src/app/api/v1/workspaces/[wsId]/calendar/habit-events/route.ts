import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
});

interface RouteParams {
  wsId: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      start_at: url.searchParams.get('start_at'),
      end_at: url.searchParams.get('end_at'),
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parsedQuery.error.issues,
        },
        { status: 400 }
      );
    }

    const { start_at, end_at } = parsedQuery.data;
    const sbAdmin = await createAdminClient();

    const { data: habitEvents, error } = await sbAdmin
      .from('habit_calendar_events')
      .select(
        `
        event_id,
        completed,
        workspace_habits!inner (
          ws_id
        ),
        workspace_calendar_events!inner (
          start_at,
          end_at
        )
      `
      )
      .eq('workspace_habits.ws_id', wsId)
      .lt('workspace_calendar_events.start_at', end_at)
      .gt('workspace_calendar_events.end_at', start_at);

    if (error) {
      console.error('Error fetching habit calendar events:', error);
      return NextResponse.json(
        { error: 'Failed to fetch habit calendar events' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      habitEventIds: (habitEvents ?? [])
        .map((record) => record.event_id)
        .filter((eventId): eventId is string => !!eventId),
      completedHabitEventIds: (habitEvents ?? [])
        .filter((record) => record.completed)
        .map((record) => record.event_id)
        .filter((eventId): eventId is string => !!eventId),
    });
  } catch (error) {
    console.error('Error in habit calendar events API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
