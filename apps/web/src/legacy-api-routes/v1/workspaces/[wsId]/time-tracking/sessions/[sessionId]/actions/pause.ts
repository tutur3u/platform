import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { NextResponse } from 'next/server';

import type { PauseActionBody, SessionRecord } from '../schemas';
import { checkSessionThreshold } from '../threshold';

export async function handlePauseAction({
  sbAdmin,
  session,
  sessionId,
  normalizedWsId,
  userId,
  canBypass,
  requestBody,
}: {
  sbAdmin: TypedSupabaseClient;
  session: SessionRecord;
  sessionId: string;
  normalizedWsId: string;
  userId: string;
  canBypass: boolean;
  requestBody: PauseActionBody;
}): Promise<NextResponse> {
  const { breakTypeId, breakTypeName, pendingApproval } = requestBody;
  const isBreakPause = breakTypeId || breakTypeName;

  if (!isBreakPause && !canBypass) {
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

  const endTime = new Date().toISOString();
  const startTime = new Date(session.start_time);
  const durationSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);

  if (isBreakPause) {
    let finalBreakTypeId = breakTypeId;
    let finalBreakTypeName = breakTypeName;

    if (!finalBreakTypeId) {
      const { data: defaultBreakType } = await sbAdmin
        .from('workspace_break_types')
        .select('*')
        .eq('ws_id', normalizedWsId)
        .eq('is_default', true)
        .maybeSingle();

      if (defaultBreakType) {
        finalBreakTypeId = defaultBreakType.id;
        finalBreakTypeName = defaultBreakType.name;
      }
    }

    const { error: rpcError } = await sbAdmin.rpc('pause_session_for_break', {
      p_session_id: sessionId,
      p_end_time: endTime,
      p_duration_seconds: durationSeconds,
      p_pending_approval: pendingApproval || false,
    });

    if (rpcError) {
      console.error('RPC pause_session_for_break failed:', rpcError);
      throw rpcError;
    }

    const { error: breakError } = await sbAdmin
      .from('time_tracking_breaks')
      .insert({
        session_id: sessionId,
        break_type_id: finalBreakTypeId || null,
        break_type_name: finalBreakTypeName || 'Break',
        break_start: endTime,
        break_end: null,
        created_by: userId,
      });

    if (breakError) {
      console.error('Failed to create break record:', breakError);
      const { error: rollbackError } = await sbAdmin
        .from('time_tracking_sessions')
        .update({
          end_time: null,
          duration_seconds: null,
          is_running: true,
          pending_approval: session.pending_approval,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (rollbackError) {
        console.error('Failed to rollback session pause:', rollbackError);
      } else {
        console.info('Rolled back session pause after break insert failure', {
          sessionId,
        });
      }
      return NextResponse.json(
        { error: 'Failed to create break record' },
        { status: 500 }
      );
    }

    const { data: fullSession, error: fetchError } = await sbAdmin
      .from('time_tracking_sessions')
      .select(`
            *,
            category:time_tracking_categories(*),
            task:tasks(*)
          `)
      .eq('id', sessionId)
      .single();

    if (fetchError) throw fetchError;

    return NextResponse.json({ session: fullSession });
  }

  const { data, error } = await sbAdmin
    .from('time_tracking_sessions')
    .update({
      end_time: endTime,
      duration_seconds: durationSeconds,
      is_running: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select(
      `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
    )
    .single();

  if (error) throw error;

  return NextResponse.json({ session: data });
}
