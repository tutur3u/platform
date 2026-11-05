import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { TutoringMarkSchema } from '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/shared';
import { notifyCompletionSafely } from '@/lib/tutoring/completion-notification';
import {
  freezeLinkedLessonContent,
  LINKED_CONTENT_NOT_STORED,
} from '@/lib/tutoring/linked-content';
import { resolveTutoringWriteScope } from '@/lib/tutoring/read-scope';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';

interface Params {
  params: Promise<{ wsId: string; id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const access = await resolveTutoringRouteAccess(request, wsId);
  const { normalizedWsId, permissions, user } = access;

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

  const parsed = TutoringMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const resolvedAt =
    parsed.data.attendanceStatus === 'DONE' ? new Date().toISOString() : null;
  const sbAdmin = await createAdminClient();
  const scope = await resolveTutoringWriteScope({ request, access, sbAdmin });
  if (!scope.allowed)
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const tutoringSessionsClient = sbAdmin.schema('private');
  // Without the manager permission only the actor's own sessions are in scope;
  // the same filter pins the write so a reassignment cannot slip past it.
  if (scope.teacherId) {
    const { data: owned, error: lookupError } = await tutoringSessionsClient
      .from('workspace_tutoring_sessions')
      .select('id')
      .eq('id', id)
      .eq('ws_id', normalizedWsId)
      .eq('teacher_user_id', scope.teacherId)
      .maybeSingle();
    if (lookupError) {
      console.error('Failed to load tutoring session for marking', lookupError);
      return NextResponse.json(
        { message: 'Failed to mark session' },
        { status: 500 }
      );
    }
    if (!owned) {
      return NextResponse.json(
        { message: 'Session not found' },
        { status: 404 }
      );
    }
  }
  let updateQuery = tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .update({
      attendance_status: parsed.data.attendanceStatus,
      resolved_at: resolvedAt,
    })
    .eq('id', id)
    .eq('ws_id', normalizedWsId);
  if (scope.teacherId)
    updateQuery = updateQuery.eq('teacher_user_id', scope.teacherId);
  const { data, error } = await updateQuery.select('id').maybeSingle();

  if (error) {
    console.error('Failed to mark tutoring session', error);
    return NextResponse.json(
      { message: 'Failed to mark session' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  if (parsed.data.attendanceStatus === 'DONE') {
    const frozen = await freezeLinkedLessonContent({
      sbAdmin,
      sessionId: id,
      wsId: normalizedWsId,
    });
    await notifyCompletionSafely({
      actorUserId: user?.id ?? null,
      sbAdmin,
      sessionId: id,
      wsId: normalizedWsId,
    });
    // Completion stands; the client warns that the notes may need a check.
    if (frozen === 'failed')
      return NextResponse.json({
        message: 'success',
        warning: LINKED_CONTENT_NOT_STORED,
      });
  }

  return NextResponse.json({ message: 'success' });
}
