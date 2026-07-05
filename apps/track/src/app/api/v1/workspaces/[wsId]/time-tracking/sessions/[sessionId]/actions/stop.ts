import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { NextResponse } from 'next/server';

import type { SessionRecord } from '../schemas';
import { checkSessionThreshold } from '../threshold';

export async function handleStopAction({
  sbAdmin,
  session,
  sessionId,
  normalizedWsId,
  canBypass,
}: {
  sbAdmin: TypedSupabaseClient;
  session: SessionRecord;
  sessionId: string;
  normalizedWsId: string;
  canBypass: boolean;
}): Promise<NextResponse> {
  const hasPendingApproval = session.pending_approval === true;
  if (!hasPendingApproval && !canBypass) {
    const thresholdCheck = await checkSessionThreshold(
      sbAdmin,
      normalizedWsId,
      session.start_time,
      {
        sessionId: sessionId,
        returnChainDetails: true,
      }
    );

    if (thresholdCheck.exceeds) {
      return NextResponse.json(
        {
          error:
            thresholdCheck.message || 'Session exceeds workspace threshold',
          code: 'THRESHOLD_EXCEEDED',
          thresholdDays: thresholdCheck.thresholdDays,
          chainSummary: thresholdCheck.chainSummary,
          sessionId: sessionId,
        },
        { status: 400 }
      );
    }
  }

  const isPaused = !session.is_running;
  const endTime = new Date().toISOString();

  const { data: activeBreak } = await sbAdmin
    .from('time_tracking_breaks')
    .select('*')
    .eq('session_id', sessionId)
    .is('break_end', null)
    .order('break_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeBreak) {
    const { data: updatedBreakRows, error: updateError } = await sbAdmin
      .from('time_tracking_breaks')
      .update({
        break_end: endTime,
      })
      .eq('id', activeBreak.id)
      .select('id');

    if (updateError || !updatedBreakRows || updatedBreakRows.length === 0) {
      console.error('Failed to close active break on stop:', updateError);
      return NextResponse.json(
        { error: 'Failed to close active break on stop' },
        { status: 500 }
      );
    }
  }

  if (isPaused) {
    const { data: pausedSession, error: pausedSessionError } = await sbAdmin
      .from('time_tracking_sessions')
      .select(
        `
            *,
            category:time_tracking_categories(*),
            task:tasks(*)
          `
      )
      .eq('id', sessionId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    if (pausedSessionError) {
      throw pausedSessionError;
    }

    if (!pausedSession) {
      return NextResponse.json(
        { error: 'Failed to fetch stopped session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session: pausedSession });
  }

  const startTime = new Date(session.start_time);
  const durationSeconds = Math.floor(
    (new Date(endTime).getTime() - startTime.getTime()) / 1000
  );

  const { data: updatedSession, error: updateSessionError } = await sbAdmin
    .from('time_tracking_sessions')
    .update({
      end_time: endTime,
      duration_seconds: durationSeconds,
      is_running: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('ws_id', normalizedWsId)
    .select(
      `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
    )
    .maybeSingle();

  if (updateSessionError) {
    throw updateSessionError;
  }

  if (!updatedSession) {
    return NextResponse.json(
      { error: 'Failed to update session when stopping' },
      { status: 500 }
    );
  }

  return NextResponse.json({ session: updatedSession });
}
