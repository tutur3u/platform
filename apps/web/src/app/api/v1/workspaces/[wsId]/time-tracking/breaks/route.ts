import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const createBreakSchema = z.object({
  session_id: z.guid('Invalid session ID format'),
  break_type_id: z.guid('Invalid break type ID format').optional(),
  break_type_name: z.string().max(MAX_NAME_LENGTH).optional(),
  break_start: z.iso.datetime({ message: 'Invalid break_start timestamp' }),
  break_end: z.iso
    .datetime({ message: 'Invalid break_end timestamp' })
    .optional(),
});

const getBreaksSchema = z.object({
  sessionId: z.guid().optional(),
  sessionIds: z.string().optional(),
  summaryOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsedQuery = getBreaksSchema.safeParse(searchParams);

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', issues: parsedQuery.error.issues },
        { status: 400 }
      );
    }

    const requestedSessionIds = [
      ...(parsedQuery.data.sessionId ? [parsedQuery.data.sessionId] : []),
      ...(parsedQuery.data.sessionIds || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ];
    const sessionIds = Array.from(new Set(requestedSessionIds));

    if (sessionIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one sessionId is required' },
        { status: 400 }
      );
    }

    if (parsedQuery.data.summaryOnly) {
      const { data, error } = await sbAdmin
        .from('time_tracking_breaks')
        .select(
          'session_id, break_duration_seconds, session:time_tracking_sessions!inner(ws_id, user_id)'
        )
        .in('session_id', sessionIds)
        .eq('session.ws_id', normalizedWsId)
        .eq('session.user_id', user.id)
        .not('break_duration_seconds', 'is', null);

      if (error) {
        throw error;
      }

      const breaksBySession: Record<
        string,
        Array<{ break_duration_seconds: number }>
      > = {};

      for (const breakRecord of data || []) {
        if (!breaksBySession[breakRecord.session_id]) {
          breaksBySession[breakRecord.session_id] = [];
        }

        breaksBySession[breakRecord.session_id]?.push({
          break_duration_seconds: breakRecord.break_duration_seconds ?? 0,
        });
      }

      return NextResponse.json({ breaksBySession });
    }

    if (sessionIds.length > 1) {
      return NextResponse.json(
        { error: 'Detailed break fetch only supports a single sessionId' },
        { status: 400 }
      );
    }

    const { data, error } = await sbAdmin
      .from('time_tracking_breaks')
      .select(
        '*, break_type:workspace_break_types(*), session:time_tracking_sessions!inner(ws_id, user_id)'
      )
      .eq('session_id', sessionIds[0] || '')
      .eq('session.ws_id', normalizedWsId)
      .eq('session.user_id', user.id)
      .order('break_start', { ascending: false });

    if (error) {
      throw error;
    }

    const breaks = (data || []).map(({ session: _session, ...breakRecord }) => {
      return breakRecord;
    });

    return NextResponse.json({ breaks });
  } catch (error) {
    console.error('Error fetching breaks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createBreakSchema.safeParse(body);
    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.message },
        { status: 400 }
      );
    }
    const {
      session_id,
      break_type_id,
      break_type_name,
      break_start,
      break_end,
    } = validatedData.data;

    const sbAdmin = await createAdminClient();

    // Verify the session belongs to the user in this workspace
    const { data: session } = await sbAdmin
      .from('time_tracking_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Create the break record
    const { data: breakRecord, error: breakError } = await sbAdmin
      .from('time_tracking_breaks')
      .insert({
        session_id,
        break_type_id: break_type_id || null,
        break_type_name: break_type_name || 'Break',
        break_start,
        break_end: break_end || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (breakError) {
      console.error('Failed to create break:', breakError);
      return NextResponse.json(
        { error: 'Failed to create break' },
        { status: 500 }
      );
    }

    return NextResponse.json({ break: breakRecord });
  } catch (error) {
    console.error('Error in break creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
