import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveTimeTrackingWorkspaceAccess } from '../_lib';

type Params = { sessionId: string; wsId: string };

const stopSessionSchema = z.object({ action: z.literal('stop') });

export const PATCH = withSessionAuth<Params>(
  async (request, { user, supabase }, { sessionId, wsId }) => {
    const validation = stopSessionSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Only stopping task sessions is supported in Tasks' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();
    const access = await resolveTimeTrackingWorkspaceAccess({
      rawWsId: wsId,
      sbAdmin,
      sessionClient: supabase,
      userId: user.id,
    });
    if (!access.ok) return access.response;

    const { data: session, error: sessionError } = await sbAdmin
      .from('time_tracking_sessions')
      .select('id, is_running, start_time')
      .eq('id', sessionId)
      .eq('ws_id', access.normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (sessionError) {
      console.error('Failed to load the task timer session:', sessionError);
      return NextResponse.json(
        { error: 'Failed to load timer session' },
        { status: 500 }
      );
    }
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (!session.is_running) {
      return NextResponse.json({ session });
    }

    const now = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(session.start_time).getTime()) / 1000
      )
    );
    const nowIso = now.toISOString();

    const { error: breakError } = await sbAdmin
      .from('time_tracking_breaks')
      .update({ break_end: nowIso })
      .eq('session_id', sessionId)
      .is('break_end', null);
    if (breakError) {
      console.error('Failed to close the active task timer break:', breakError);
      return NextResponse.json(
        { error: 'Failed to stop active timer break' },
        { status: 500 }
      );
    }

    const { data: stoppedSession, error } = await sbAdmin
      .from('time_tracking_sessions')
      .update({
        duration_seconds: durationSeconds,
        end_time: nowIso,
        is_running: false,
        updated_at: nowIso,
      })
      .eq('id', sessionId)
      .eq('ws_id', access.normalizedWsId)
      .eq('user_id', user.id)
      .select('*, category:time_tracking_categories(*), task:tasks(id, name)')
      .maybeSingle();

    if (error || !stoppedSession) {
      console.error('Failed to stop the task timer session:', error);
      return NextResponse.json(
        { error: 'Failed to stop timer' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session: stoppedSession });
  }
);
