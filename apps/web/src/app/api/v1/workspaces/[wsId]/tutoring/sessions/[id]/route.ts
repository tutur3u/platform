import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TablesUpdate } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { getAdjacentSessionDates } from '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/sessions/session-create-helpers';
import {
  findConflictsWithExistingSessions,
  type TutoringSessionSlotInput,
  TutoringSessionUpdateSchema,
} from '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/shared';
import { notifyCompletionSafely } from '@/lib/tutoring/completion-notification';
import {
  freezeLinkedLessonContent,
  LINKED_CONTENT_NOT_STORED,
} from '@/lib/tutoring/linked-content';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';
import { listWorkspaceTeacherIds } from '@/lib/tutoring/teachers';
import {
  denyWeakContentEdit,
  isWeakSupportSession,
} from '@/lib/tutoring/weak-content-access';

interface Params {
  params: Promise<{ wsId: string; id: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const { normalizedWsId, permissions, user } =
    await resolveTutoringRouteAccess(request, wsId);

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

  const updates: TablesUpdate<
    { schema: 'private' },
    'workspace_tutoring_sessions'
  > = {};
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
  if (parsed.data.attendanceStatus !== undefined) {
    updates.attendance_status = parsed.data.attendanceStatus;
    if (parsed.data.resolvedAt === undefined) {
      updates.resolved_at =
        parsed.data.attendanceStatus === 'DONE'
          ? new Date().toISOString()
          : null;
    }
  }
  if (parsed.data.parentMessagePreview !== undefined)
    updates.parent_message_preview = parsed.data.parentMessagePreview;
  if (parsed.data.resolvedAt !== undefined)
    updates.resolved_at = parsed.data.resolvedAt;

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const tutoringSessionsClient = sbAdmin.schema('private');

  const { data: currentSession, error: currentSessionError } =
    await tutoringSessionsClient
      .from('workspace_tutoring_sessions')
      .select(
        'id,group_id,session_date,start_time,duration_minutes,teacher_user_id,student_user_id,reason_type,source_feedback_id'
      )
      .eq('id', id)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

  if (currentSessionError) {
    console.error('Failed to load tutoring session for update', {
      error: currentSessionError,
      sessionId: id,
      wsId: normalizedWsId,
    });

    return NextResponse.json(
      { message: 'Failed to update session' },
      { status: 500 }
    );
  }

  if (!currentSession) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  // Changing the text (or the reason) of weak-support content follows the same
  // class-manager restriction as the feedback it comes from.
  const changesContent =
    parsed.data.content !== undefined ||
    parsed.data.reasonDetail !== undefined ||
    (parsed.data.reasonType !== undefined &&
      parsed.data.reasonType !== currentSession.reason_type);
  const deniedWeakContent = await denyWeakContentEdit({
    permissions,
    sbAdmin,
    touchesWeakContent:
      changesContent &&
      (isWeakSupportSession({
        reasonType: currentSession.reason_type,
        sourceFeedbackId: currentSession.source_feedback_id,
      }) ||
        parsed.data.reasonType === 'WEAK_SUPPORT'),
    wsId: normalizedWsId,
  });
  if (deniedWeakContent) return deniedWeakContent;

  if (parsed.data.teacherUserId) {
    const teacherCheck = await listWorkspaceTeacherIds({
      normalizedWsId,
      sbAdmin,
      teacherUserIds: [parsed.data.teacherUserId],
    });

    if (teacherCheck.error) {
      console.error('Failed to validate tutoring teacher assignment', {
        error: teacherCheck.error,
        sessionId: id,
        teacherUserId: parsed.data.teacherUserId,
        wsId: normalizedWsId,
      });

      return NextResponse.json(
        { message: 'Failed to validate teacher assignment' },
        { status: 500 }
      );
    }

    if (!teacherCheck.teacherIds.has(parsed.data.teacherUserId)) {
      return NextResponse.json(
        { message: 'Teacher must be an eligible teacher in this workspace' },
        { status: 400 }
      );
    }
  }

  if (
    parsed.data.sessionDate !== undefined ||
    parsed.data.startTime !== undefined ||
    parsed.data.durationMinutes !== undefined ||
    parsed.data.teacherUserId !== undefined
  ) {
    const nextSlot: TutoringSessionSlotInput = {
      groupId: currentSession.group_id,
      durationMinutes:
        parsed.data.durationMinutes ?? currentSession.duration_minutes,
      sessionDate: parsed.data.sessionDate ?? currentSession.session_date,
      startTime: parsed.data.startTime ?? currentSession.start_time,
      studentUserId: currentSession.student_user_id,
      teacherUserId:
        parsed.data.teacherUserId === undefined
          ? currentSession.teacher_user_id
          : parsed.data.teacherUserId,
    };
    const sessionDates = getAdjacentSessionDates(nextSlot.sessionDate);

    const teacherQuery = nextSlot.teacherUserId
      ? tutoringSessionsClient
          .from('workspace_tutoring_sessions')
          .select(
            'id,group_id,session_date,start_time,duration_minutes,teacher_user_id,student_user_id'
          )
          .eq('ws_id', normalizedWsId)
          .in('session_date', sessionDates)
          .eq('teacher_user_id', nextSlot.teacherUserId)
          .neq('id', id)
      : Promise.resolve({ data: [], error: null });

    const studentQuery = tutoringSessionsClient
      .from('workspace_tutoring_sessions')
      .select(
        'id,group_id,session_date,start_time,duration_minutes,teacher_user_id,student_user_id'
      )
      .eq('ws_id', normalizedWsId)
      .in('session_date', sessionDates)
      .eq('student_user_id', nextSlot.studentUserId)
      .neq('id', id);

    const [teacherResult, studentResult] = await Promise.all([
      teacherQuery,
      studentQuery,
    ]);

    if (teacherResult.error || studentResult.error) {
      console.error('Failed to validate tutoring scheduling conflicts', {
        error: teacherResult.error ?? studentResult.error,
        sessionId: id,
        wsId: normalizedWsId,
      });

      return NextResponse.json(
        { message: 'Failed to validate scheduling conflicts' },
        { status: 500 }
      );
    }

    const existingSessionsMap = new Map<
      string,
      (typeof studentResult.data)[number]
    >();
    for (const row of teacherResult.data ?? []) {
      existingSessionsMap.set(row.id, row);
    }
    for (const row of studentResult.data ?? []) {
      existingSessionsMap.set(row.id, row);
    }

    const conflicts = findConflictsWithExistingSessions(
      [nextSlot],
      [...existingSessionsMap.values()]
    );

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          message: 'Scheduling conflict detected with existing sessions',
          code: 'SCHEDULING_CONFLICT',
          conflicts,
        },
        { status: 409 }
      );
    }
  }

  let updateQuery = tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .update(updates)
    .eq('id', id)
    .eq('ws_id', normalizedWsId);
  // The weak-content verdict above rests on the reason and source feedback we
  // read; pin both so a concurrent change cannot slip content past the check.
  // Any reason in the payload is pinned, even one equal to the stale read, so
  // it cannot undo a concurrent switch. Attendance-only edits stay unpinned.
  const pinsReason = changesContent || parsed.data.reasonType !== undefined;
  if (pinsReason) {
    updateQuery = updateQuery.eq('reason_type', currentSession.reason_type);
    updateQuery =
      currentSession.source_feedback_id === null
        ? updateQuery.is('source_feedback_id', null)
        : updateQuery.eq(
            'source_feedback_id',
            currentSession.source_feedback_id
          );
  }
  const { data, error } = await updateQuery.select('id').maybeSingle();

  if (error) {
    console.error('Failed to update tutoring session', error);
    return NextResponse.json(
      { message: 'Failed to update session' },
      { status: 500 }
    );
  }

  if (!data) {
    if (pinsReason) {
      return NextResponse.json(
        { message: 'Session changed before the update' },
        { status: 409 }
      );
    }
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  // Completing with no (or blank) content keeps the linked notes; only real
  // text sent alongside the completion counts as a manual edit.
  if (parsed.data.attendanceStatus === 'DONE') {
    const frozen = parsed.data.content?.trim()
      ? 'skipped'
      : await freezeLinkedLessonContent({
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

export async function DELETE(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const { normalizedWsId, permissions } = await resolveTutoringRouteAccess(
    request,
    wsId
  );

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const tutoringSessionsClient = sbAdmin.schema('private');
  const sessionQuery = tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .select('id,attendance_status,reason_type,source_feedback_id')
    .eq('id', id)
    .eq('ws_id', normalizedWsId);
  const { data: session, error: lookupError } =
    await sessionQuery.maybeSingle();

  if (lookupError) {
    console.error('Failed to load tutoring session for deletion', {
      error: lookupError,
      sessionId: id,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to delete session' },
      { status: 500 }
    );
  }
  if (!session) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }
  // Deleting weak-support content follows the same class-manager restriction as
  // editing it.
  const deniedWeakContent = await denyWeakContentEdit({
    permissions,
    sbAdmin,
    touchesWeakContent: isWeakSupportSession({
      reasonType: session.reason_type,
      sourceFeedbackId: session.source_feedback_id,
    }),
    wsId: normalizedWsId,
  });
  if (deniedWeakContent) return deniedWeakContent;
  if (
    session.attendance_status !== 'PENDING' &&
    session.attendance_status !== 'CANCELLED'
  ) {
    return NextResponse.json(
      { message: 'Only pending or cancelled sessions can be deleted' },
      { status: 409 }
    );
  }

  // The weak-content verdict above rests on the reason and source feedback we
  // read; pin both so a concurrent switch cannot delete protected content.
  const deleteQuery = tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .delete()
    .eq('id', id)
    .eq('ws_id', normalizedWsId)
    .eq('reason_type', session.reason_type)
    .in('attendance_status', ['PENDING', 'CANCELLED']);
  const { data: deleted, error: deleteError } =
    await (session.source_feedback_id === null
      ? deleteQuery.is('source_feedback_id', null)
      : deleteQuery.eq('source_feedback_id', session.source_feedback_id)
    )
      .select('id')
      .maybeSingle();

  if (deleteError) {
    console.error('Failed to delete tutoring session', {
      error: deleteError,
      sessionId: id,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to delete session' },
      { status: 500 }
    );
  }
  if (!deleted) {
    return NextResponse.json(
      { message: 'Session changed before deletion' },
      { status: 409 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
