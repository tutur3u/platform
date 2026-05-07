import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TablesUpdate } from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { TutoringSessionUpdateSchema } from '../../shared';

interface Params {
  params: Promise<{ wsId: string; id: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TutoringSessionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const updates: TablesUpdate<'workspace_tutoring_sessions'> = {};
  if (parsed.data.teacherUserId !== undefined)
    updates.teacher_user_id = parsed.data.teacherUserId;
  if (parsed.data.sessionDate !== undefined)
    updates.session_date = parsed.data.sessionDate;
  if (parsed.data.startTime !== undefined)
    updates.start_time = parsed.data.startTime;
  if (parsed.data.durationMinutes !== undefined)
    updates.duration_minutes = parsed.data.durationMinutes;
  if (parsed.data.reasonType !== undefined)
    updates.reason_type = parsed.data.reasonType;
  if (parsed.data.reasonDetail !== undefined)
    updates.reason_detail = parsed.data.reasonDetail;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.attendanceStatus !== undefined)
    updates.attendance_status = parsed.data.attendanceStatus;
  if (parsed.data.parentMessagePreview !== undefined)
    updates.parent_message_preview = parsed.data.parentMessagePreview;
  if (parsed.data.resolvedAt !== undefined)
    updates.resolved_at = parsed.data.resolvedAt;

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_tutoring_sessions')
    .update(updates)
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to update tutoring session', error);
    return NextResponse.json(
      { message: 'Failed to update session' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'success' });
}
