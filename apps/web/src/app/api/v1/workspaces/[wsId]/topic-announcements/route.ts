import { createTopicAnnouncementListHandler } from '@tuturuuu/users-core/routes/topic-announcements';
import { NextResponse } from 'next/server';
import {
  attachTopicAnnouncementGroups,
  computeTopicAnnouncementSendDueAt,
  getWorkspaceSchedulingTimezone,
  insertTopicAnnouncementAttachmentDrafts,
  mapTopicAnnouncementRow,
  resolveTopicAnnouncementsAccess,
  serializeTopicAnnouncementContacts,
  type TopicAnnouncementContactRow,
  TopicAnnouncementPayloadSchema,
  type TopicAnnouncementsSupabaseClient,
  topicAnnouncementAttachmentValidationResponse,
  validateTeacherTopicAnnouncementWrite,
  validateTopicAnnouncementAttachmentDraftObjects,
  validateTopicAnnouncementGroupId,
  validateTopicAnnouncementWorkspaceUserId,
} from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared';

interface Params {
  params: Promise<{ wsId: string }>;
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

export const GET = createTopicAnnouncementListHandler(
  resolveTopicAnnouncementsAccess
);

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
    teacherAccess: 'create',
  });
  if (access.response) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TopicAnnouncementPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin, scope } = access.context;
  const payload = parsed.data;
  const teacherWriteError = validateTeacherTopicAnnouncementWrite({
    next: payload,
    scope,
  });
  if (teacherWriteError) {
    return NextResponse.json(
      { message: teacherWriteError.message },
      { status: teacherWriteError.status }
    );
  }
  // Teachers always own the topics they create.
  const teacherWorkspaceUserId =
    scope?.kind === 'teacher'
      ? scope.workspaceUserId
      : (payload.teacherWorkspaceUserId ?? null);

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

  const invalidGroup = await validateTopicAnnouncementGroupId({
    groupId: payload.groupId,
    normalizedWsId,
    sbAdmin,
  });
  if (invalidGroup) return invalidGroup;

  const invalidTeacher = await validateTopicAnnouncementWorkspaceUserId({
    normalizedWsId,
    sbAdmin,
    workspaceUserId: teacherWorkspaceUserId,
  });
  if (invalidTeacher) return invalidTeacher;

  const attachmentValidation =
    await validateTopicAnnouncementAttachmentDraftObjects({
      attachmentDrafts: payload.attachmentDrafts,
      normalizedWsId,
    });
  if (!attachmentValidation.ok) {
    return topicAnnouncementAttachmentValidationResponse(attachmentValidation);
  }

  const timezone = await getWorkspaceSchedulingTimezone(
    sbAdmin,
    normalizedWsId
  );
  const { data: announcement, error } = await sbAdmin
    .from('topic_announcements')
    .insert({
      body: payload.body,
      class_label: payload.classLabel,
      course_book: payload.courseBook ?? null,
      created_by: actorUserId,
      day_label: payload.dayLabel,
      end_time: payload.endTime ?? null,
      group_id: payload.groupId ?? null,
      place: payload.place,
      room: payload.room,
      send_due_at: computeTopicAnnouncementSendDueAt({
        sessionDate: payload.sessionDate,
        startTime: payload.startTime,
        timeZone: timezone,
      }),
      session_date: payload.sessionDate ?? null,
      source_type: payload.sourceType,
      start_time: payload.startTime ?? null,
      status: payload.status ?? 'draft',
      teacher_workspace_user_id: teacherWorkspaceUserId,
      title: payload.title,
      topic: payload.topic,
      updated_by: actorUserId,
      video_url: payload.videoUrl ?? null,
      ws_id: normalizedWsId,
    })
    .select('*')
    .single();

  if (error) throw error;

  await replaceRecipients({
    announcementId: announcement.id,
    contactIds: payload.contactIds,
    sbAdmin,
  });
  await insertTopicAnnouncementAttachmentDrafts({
    actorUserId,
    announcementId: announcement.id,
    attachmentDrafts: payload.attachmentDrafts,
    normalizedWsId,
    sbAdmin,
  });

  const { data: recipientRows, error: recipientsError } = await sbAdmin
    .from('topic_announcement_recipients')
    .select('contact:topic_announcement_contacts(*)')
    .eq('announcement_id', announcement.id);
  if (recipientsError) throw recipientsError;

  const recipientContacts = (recipientRows ?? [])
    .map((row: { contact: TopicAnnouncementContactRow | null }) => row.contact)
    .filter(
      (
        contact: TopicAnnouncementContactRow | null
      ): contact is TopicAnnouncementContactRow => Boolean(contact)
    );

  const { data: enrichedAnnouncement, error: enrichedError } = await sbAdmin
    .from('topic_announcements')
    .select('*')
    .eq('id', announcement.id)
    .maybeSingle();
  if (enrichedError) throw enrichedError;
  const [announcementWithGroup] = await attachTopicAnnouncementGroups(
    sbAdmin,
    enrichedAnnouncement ? [enrichedAnnouncement] : []
  );

  const { data: attachments, error: attachmentsError } = await sbAdmin
    .from('topic_announcement_attachments')
    .select(
      'id,content_type,created_at,file_name,size_bytes,storage_path,storage_provider'
    )
    .eq('announcement_id', announcement.id)
    .order('created_at', { ascending: true });
  if (attachmentsError) throw attachmentsError;

  return NextResponse.json(
    {
      data: mapTopicAnnouncementRow({
        ...(announcementWithGroup ?? announcement),
        attachments: attachments ?? [],
        contacts: await serializeTopicAnnouncementContacts(
          sbAdmin,
          recipientContacts
        ),
      }),
    },
    { status: 201 }
  );
}
