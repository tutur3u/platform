import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { NextResponse } from 'next/server';

import type { SessionRecord } from '../schemas';

export async function handleResumeAction({
  sbAdmin,
  session,
  sessionId,
  normalizedWsId,
  userId,
}: {
  sbAdmin: TypedSupabaseClient;
  session: SessionRecord;
  sessionId: string;
  normalizedWsId: string;
  userId: string;
}): Promise<NextResponse> {
  const resumeTime = new Date().toISOString();

  const { data: activeBreak } = await sbAdmin
    .from('time_tracking_breaks')
    .select('*')
    .eq('session_id', sessionId)
    .is('break_end', null)
    .order('break_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeBreak) {
    const { error: updateError } = await sbAdmin
      .from('time_tracking_breaks')
      .update({
        break_end: resumeTime,
      })
      .eq('id', activeBreak.id);

    if (updateError) {
      console.error('Failed to close break on resume:', updateError);
      return NextResponse.json(
        { error: 'Failed to close break on resume' },
        { status: 500 }
      );
    }
  }

  const { data, error } = await sbAdmin
    .from('time_tracking_sessions')
    .insert([
      {
        ws_id: normalizedWsId,
        user_id: userId,
        title: session.title,
        description: session.description,
        category_id: session.category_id,
        task_id: session.task_id,
        start_time: resumeTime,
        is_running: true,
        was_resumed: true,
        parent_session_id: sessionId,
        created_at: resumeTime,
        updated_at: resumeTime,
      },
    ])
    .select(
      `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
    )
    .single();

  if (error) throw error;

  return NextResponse.json({
    session: data,
    breakDuration: activeBreak
      ? Math.floor(
          (new Date(resumeTime).getTime() -
            new Date(activeBreak.break_start).getTime()) /
            1000
        )
      : null,
  });
}
