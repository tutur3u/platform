import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';

import type { EditActionBody, SessionRecord } from '../schemas';

export async function handleEditAction({
  sbAdmin,
  session,
  sessionId,
  normalizedWsId,
  canBypass,
  requestBody,
}: {
  sbAdmin: TypedSupabaseClient;
  session: SessionRecord;
  sessionId: string;
  normalizedWsId: string;
  canBypass: boolean;
  requestBody: EditActionBody;
}): Promise<NextResponse> {
  const { title, description, categoryId, taskId, startTime, endTime } =
    requestBody;

  const now = new Date();
  if (startTime !== undefined) {
    const start = new Date(startTime);
    if (start > now) {
      return NextResponse.json(
        {
          error:
            'Cannot update a time tracking session to have a start time in the future.',
        },
        { status: 400 }
      );
    }
  }

  if (endTime !== undefined) {
    const end = new Date(endTime);
    if (end > now) {
      return NextResponse.json(
        {
          error:
            'Cannot update a time tracking session to have an end time in the future.',
        },
        { status: 400 }
      );
    }
  }

  const effectiveStart =
    startTime !== undefined
      ? new Date(startTime)
      : session.start_time
        ? new Date(session.start_time)
        : null;
  const effectiveEnd =
    endTime !== undefined
      ? new Date(endTime)
      : session.end_time
        ? new Date(session.end_time)
        : null;

  if (
    effectiveStart !== null &&
    effectiveEnd !== null &&
    !(effectiveStart.getTime() < effectiveEnd.getTime())
  ) {
    return NextResponse.json(
      { error: 'startTime must be before endTime' },
      { status: 400 }
    );
  }

  const updateData: {
    updated_at: string;
    title?: string;
    description?: string | null;
    category_id?: string | null;
    task_id?: string | null;
    start_time?: string;
    end_time?: string;
    duration_seconds?: number;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (title !== undefined) updateData.title = title.trim();
  if (description !== undefined)
    updateData.description = description?.trim() || null;
  if (categoryId !== undefined) updateData.category_id = categoryId || null;
  if (taskId !== undefined) updateData.task_id = taskId || null;

  const isEditingTime = startTime !== undefined || endTime !== undefined;
  if (session.is_running && isEditingTime && !canBypass) {
    return NextResponse.json(
      { error: 'Cannot edit start_time or end_time for a running session' },
      { status: 400 }
    );
  }

  if (!session.is_running) {
    if (isEditingTime && !canBypass) {
      const { data: workspaceSettings } = await sbAdmin
        .from('workspace_settings')
        .select('missed_entry_date_threshold')
        .eq('ws_id', normalizedWsId)
        .maybeSingle();

      const thresholdDays = workspaceSettings?.missed_entry_date_threshold;
      if (thresholdDays !== null && thresholdDays !== undefined) {
        if (thresholdDays === 0) {
          return NextResponse.json(
            {
              error:
                'All time edits must be submitted as requests for approval',
            },
            { status: 400 }
          );
        }

        const sessionStartTime = new Date(session.start_time);
        const thresholdAgo = new Date();
        thresholdAgo.setDate(thresholdAgo.getDate() - thresholdDays);

        if (sessionStartTime < thresholdAgo) {
          return NextResponse.json(
            {
              error: `Cannot edit start time or end time for sessions older than ${thresholdDays} day${thresholdDays !== 1 ? 's' : ''}`,
            },
            { status: 400 }
          );
        }

        if (startTime) {
          const newStartTime = new Date(startTime);
          if (newStartTime < thresholdAgo) {
            return NextResponse.json(
              {
                error: `Cannot update session to a start time more than ${thresholdDays} day${thresholdDays !== 1 ? 's' : ''} ago`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    if (startTime) updateData.start_time = new Date(startTime).toISOString();
    if (endTime) updateData.end_time = new Date(endTime).toISOString();

    if (isEditingTime) {
      const start = startTime
        ? new Date(startTime)
        : session.start_time
          ? new Date(session.start_time)
          : null;
      const end = endTime
        ? new Date(endTime)
        : session.end_time
          ? new Date(session.end_time)
          : null;
      if (start != null && end != null) {
        updateData.duration_seconds = Math.floor(
          (end.getTime() - start.getTime()) / 1000
        );
      }
    }
  }

  const hasTimeFieldUpdates =
    updateData.start_time !== undefined ||
    updateData.end_time !== undefined ||
    updateData.duration_seconds !== undefined;

  if (canBypass && hasTimeFieldUpdates) {
    const fields: Record<string, unknown> = {};
    if (updateData.title !== undefined) fields.title = updateData.title;
    if (updateData.description !== undefined)
      fields.description = updateData.description;
    if (updateData.category_id !== undefined)
      fields.category_id = updateData.category_id;
    if (updateData.task_id !== undefined) fields.task_id = updateData.task_id;
    if (updateData.start_time !== undefined)
      fields.start_time = updateData.start_time;
    if (updateData.end_time !== undefined)
      fields.end_time = updateData.end_time;
    if (updateData.duration_seconds !== undefined)
      fields.duration_seconds = updateData.duration_seconds;

    const { error: rpcError } = await sbAdmin.rpc(
      'update_time_tracking_session_with_bypass',
      {
        p_session_id: sessionId,
        p_fields: fields as Json,
      }
    );

    if (rpcError) {
      if (rpcError.code === 'P0001') {
        return NextResponse.json({ error: rpcError.message }, { status: 400 });
      }
      throw rpcError;
    }

    const { data, error: fetchError } = await sbAdmin
      .from('time_tracking_sessions')
      .select(
        `
            *,
            category:time_tracking_categories(*),
            task:tasks(*)
          `
      )
      .eq('id', sessionId)
      .single();

    if (fetchError) throw fetchError;
    return NextResponse.json({ session: data });
  }

  const { data, error } = await sbAdmin
    .from('time_tracking_sessions')
    .update(updateData)
    .eq('id', sessionId)
    .select(
      `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
    )
    .single();

  if (error) {
    if (error.code === 'P0001') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json({ session: data });
}
