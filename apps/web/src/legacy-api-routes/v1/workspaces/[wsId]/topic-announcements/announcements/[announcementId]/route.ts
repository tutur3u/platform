import {
  gateTopicAnnouncementTeacherFields,
  type TopicAnnouncementUpdatePayload,
} from '@tuturuuu/users-core/routes/topic-announcements';
import { NextResponse } from 'next/server';
import { notifyTopicAnnouncementTeachers } from '@/lib/topic-announcement-teacher-notifications';
import {
  buildTopicAnnouncementTeacherFilter,
  computeTopicAnnouncementSendDueAt,
  getWorkspaceSchedulingTimezone,
  insertTopicAnnouncementAttachmentDrafts,
  isTopicAnnouncementTopicReady,
  loadScopedTopicAnnouncement,
  resolveTopicAnnouncementsAccess,
  TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES,
  TOPIC_ANNOUNCEMENT_MAX_ATTACHMENTS,
  type TopicAnnouncementsSupabaseClient,
  TopicAnnouncementUpdateSchema,
  topicAnnouncementAttachmentValidationResponse,
  validateTeacherTopicAnnouncementWrite,
  validateTopicAnnouncementAttachmentDraftObjects,
  validateTopicAnnouncementGroupId,
  validateTopicAnnouncementWorkspaceUserId,
} from '../../shared';

interface Params {
  params: Promise<{ announcementId: string; wsId: string }>;
}

async function replaceRecipients({
  announcementId,
  contactIds,
  sbAdmin,
}: {
  announcementId: string;
  contactIds: string[];
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  await sbAdmin
    .from('topic_announcement_recipients')
    .delete()
    .eq('announcement_id', announcementId);
  const uniqueContactIds = [...new Set(contactIds)];
  if (uniqueContactIds.length === 0) return;
  const { error } = await sbAdmin.from('topic_announcement_recipients').insert(
    uniqueContactIds.map((contactId) => ({
      announcement_id: announcementId,
      contact_id: contactId,
    }))
  );
  if (error) throw error;
}

const TEACHER_EDITABLE_STATUSES = ['draft', 'queued', 'failed', 'skipped'];
/** Attachments are part of what was (or is being) emailed; keep them fixed. */
const ATTACHMENT_LOCKED_STATUSES = ['sent', 'processing'];

type ExistingAnnouncement = {
  group_id: string | null;
  session_date: string | null;
  start_time: string | null;
  status: string;
  teacher_workspace_user_id: string | null;
  topic: string | null;
};

function errorResponse(error: { message: string; status: number }) {
  return NextResponse.json(
    { message: error.message },
    { status: error.status }
  );
}

/**
 * Drops drafts already attached to the announcement (same storage path) and
 * duplicates within the request, so a client retry cannot attach, and later
 * email, the same file twice.
 */
async function dropSavedAttachmentDrafts({
  announcementId,
  attachmentDrafts,
  sbAdmin,
}: {
  announcementId: string;
  attachmentDrafts: TopicAnnouncementUpdatePayload['attachmentDrafts'];
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  if (!attachmentDrafts?.length) return attachmentDrafts;
  const { data, error } = await sbAdmin
    .from('topic_announcement_attachments')
    .select('storage_path')
    .eq('announcement_id', announcementId);
  if (error) throw error;
  const seen = new Set(
    ((data ?? []) as { storage_path: string }[]).map((row) => row.storage_path)
  );
  return attachmentDrafts.filter((draft) => {
    if (seen.has(draft.storagePath)) return false;
    seen.add(draft.storagePath);
    return true;
  });
}

async function validateAttachmentAdditions({
  announcementId,
  attachmentDrafts,
  normalizedWsId,
  sbAdmin,
}: {
  announcementId: string;
  attachmentDrafts: TopicAnnouncementUpdatePayload['attachmentDrafts'];
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  if (!attachmentDrafts?.length) return null;

  const { data: existing, error } = await sbAdmin
    .from('topic_announcement_attachments')
    .select('size_bytes')
    .eq('announcement_id', announcementId);
  if (error) throw error;
  const existingRows = (existing ?? []) as { size_bytes: number }[];
  if (
    existingRows.length + attachmentDrafts.length >
    TOPIC_ANNOUNCEMENT_MAX_ATTACHMENTS
  ) {
    return errorResponse({
      message: `Topics can have at most ${TOPIC_ANNOUNCEMENT_MAX_ATTACHMENTS} attachments`,
      status: 400,
    });
  }
  const totalBytes = [
    ...existingRows.map((row) => Number(row.size_bytes)),
    ...attachmentDrafts.map((draft) => draft.sizeBytes),
  ].reduce((total, size) => total + size, 0);
  if (totalBytes > TOPIC_ANNOUNCEMENT_MAX_ATTACHMENT_BYTES) {
    return errorResponse({
      message: 'Attachments cannot exceed 10 MB total',
      status: 413,
    });
  }

  const validation = await validateTopicAnnouncementAttachmentDraftObjects({
    attachmentDrafts,
    normalizedWsId,
  });
  return validation.ok
    ? null
    : topicAnnouncementAttachmentValidationResponse(validation);
}

export async function PATCH(request: Request, { params }: Params) {
  const { announcementId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
    teacherAccess: 'update',
  });
  if (access.response) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TopicAnnouncementUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    actorUserId,
    normalizedWsId,
    sbAdmin,
    scope,
    teacherAssignmentsEnabled,
  } = access.context;
  const enabled = teacherAssignmentsEnabled === true;
  const gated = gateTopicAnnouncementTeacherFields(parsed.data, {
    enabled,
    topicRequired: false,
  });
  if (gated.error) return NextResponse.json(gated.error, { status: 400 });
  const payload = gated.payload;

  const loaded = await loadScopedTopicAnnouncement<ExistingAnnouncement>({
    announcementId,
    columns:
      'group_id,session_date,start_time,status,teacher_workspace_user_id,topic',
    normalizedWsId,
    sbAdmin,
    scope,
  });
  if (loaded.response) return loaded.response;
  const existing = loaded.row;
  const previousTeacherId = existing.teacher_workspace_user_id;
  const isTeacher = scope?.kind === 'teacher';

  if (isTeacher && !TEACHER_EDITABLE_STATUSES.includes(existing.status)) {
    return NextResponse.json(
      { message: 'Announcement can no longer be edited' },
      { status: 409 }
    );
  }
  const teacherWriteError = validateTeacherTopicAnnouncementWrite({
    next: payload,
    scope,
  });
  if (teacherWriteError) return errorResponse(teacherWriteError);

  if (
    !isTopicAnnouncementTopicReady({
      status: payload.status ?? existing.status,
      topic: payload.topic !== undefined ? payload.topic : existing.topic,
    })
  ) {
    return NextResponse.json({ message: 'TOPIC_REQUIRED' }, { status: 400 });
  }

  if (payload.groupId !== undefined) {
    const invalidGroup = await validateTopicAnnouncementGroupId({
      groupId: payload.groupId,
      normalizedWsId,
      sbAdmin,
    });
    if (invalidGroup) return invalidGroup;
  }

  if (payload.teacherWorkspaceUserId !== undefined) {
    const invalidTeacher = await validateTopicAnnouncementWorkspaceUserId({
      normalizedWsId,
      sbAdmin,
      workspaceUserId: payload.teacherWorkspaceUserId,
    });
    if (invalidTeacher) return invalidTeacher;
  }

  if (payload.contactIds) {
    if (isTeacher) {
      return NextResponse.json(
        { message: 'Teachers cannot change topic recipients' },
        { status: 403 }
      );
    }
    const { data: contacts, error: contactsError } = await sbAdmin
      .from('topic_announcement_contacts')
      .select('id')
      .eq('ws_id', normalizedWsId)
      .eq('archived', false)
      .in('id', [...new Set(payload.contactIds)]);
    if (contactsError) throw contactsError;
    if ((contacts ?? []).length !== new Set(payload.contactIds).size) {
      return NextResponse.json(
        { message: 'One or more contacts are invalid' },
        { status: 400 }
      );
    }
  }

  const attachmentDrafts = await dropSavedAttachmentDrafts({
    announcementId,
    attachmentDrafts: payload.attachmentDrafts,
    sbAdmin,
  });
  if (
    attachmentDrafts?.length &&
    ATTACHMENT_LOCKED_STATUSES.includes(existing.status)
  ) {
    return NextResponse.json(
      { message: 'Attachments cannot be added to a sent announcement' },
      { status: 409 }
    );
  }

  const invalidAttachments = await validateAttachmentAdditions({
    announcementId,
    attachmentDrafts,
    normalizedWsId,
    sbAdmin,
  });
  if (invalidAttachments) return invalidAttachments;

  const scheduleChanged =
    enabled &&
    (payload.sessionDate !== undefined || payload.startTime !== undefined);
  const sendDueAt = scheduleChanged
    ? computeTopicAnnouncementSendDueAt({
        sessionDate:
          payload.sessionDate !== undefined
            ? payload.sessionDate
            : existing.session_date,
        startTime:
          payload.startTime !== undefined
            ? payload.startTime
            : existing.start_time,
        timeZone: await getWorkspaceSchedulingTimezone(sbAdmin, normalizedWsId),
      })
    : undefined;

  const columns = {
    body: payload.body,
    class_label: payload.classLabel,
    course_book: payload.courseBook,
    day_label: payload.dayLabel,
    end_time: payload.endTime,
    group_id: payload.groupId,
    place: payload.place,
    room: payload.room,
    send_due_at: sendDueAt,
    session_date: payload.sessionDate,
    source_type: payload.sourceType,
    start_time: payload.startTime,
    status: payload.status,
    teacher_workspace_user_id: payload.teacherWorkspaceUserId,
    title: payload.title,
    topic: payload.topic,
    video_url: payload.videoUrl,
  };
  let update = sbAdmin
    .from('topic_announcements')
    .update({
      ...Object.fromEntries(
        Object.entries(columns).filter(([, value]) => value !== undefined)
      ),
      updated_by: actorUserId,
    })
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId);
  // Re-check the assignment in the write itself, so a reassignment between
  // the load above and this update cannot let the previous teacher write.
  if (scope?.kind === 'teacher') {
    update = update
      .or(buildTopicAnnouncementTeacherFilter(scope))
      .in('status', TEACHER_EDITABLE_STATUSES);
  }
  const { data, error } = await update.select('*').maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  if (payload.contactIds) {
    await replaceRecipients({
      announcementId,
      contactIds: payload.contactIds,
      sbAdmin,
    });
  }
  await insertTopicAnnouncementAttachmentDrafts({
    actorUserId,
    announcementId,
    attachmentDrafts: attachmentDrafts ?? [],
    normalizedWsId,
    sbAdmin,
  });

  // A supervisor reassigning the topic notifies the new teacher. A failed
  // notification does not undo the saved assignment.
  let teacherNotification = null;
  if (
    payload.teacherWorkspaceUserId &&
    payload.teacherWorkspaceUserId !== previousTeacherId
  ) {
    try {
      teacherNotification = await notifyTopicAnnouncementTeachers({
        actorUserId,
        announcementIds: [announcementId],
        normalizedWsId,
        sbAdmin,
      });
    } catch (cause) {
      console.error('Failed to notify the reassigned topic teacher', {
        announcementId,
        cause,
      });
    }
  }

  return NextResponse.json({ data, teacherNotification });
}

export async function DELETE(request: Request, { params }: Params) {
  const { announcementId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const { data: existingAnnouncement, error: existingError } = await sbAdmin
    .from('topic_announcements')
    .select('id, status')
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existingAnnouncement) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (existingAnnouncement.status === 'sent') {
    return NextResponse.json(
      { message: 'Sent announcements cannot be removed' },
      { status: 409 }
    );
  }
  if (existingAnnouncement.status === 'cancelled') {
    return new NextResponse(null, { status: 204 });
  }
  if (
    !['draft', 'queued', 'failed', 'skipped'].includes(
      existingAnnouncement.status
    )
  ) {
    return NextResponse.json(
      { message: 'Announcement cannot be removed' },
      { status: 409 }
    );
  }

  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .update({
      last_error: null,
      scheduled_send_at: null,
      status: 'cancelled',
      updated_by: actorUserId,
    })
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
