import { NextResponse } from 'next/server';
import { normalizeTopicAnnouncementAttachmentFileName } from '@/lib/topic-announcement-attachments';
import { renderTopicAnnouncementEmail } from '@/lib/topic-announcements-email';
import {
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementPayloadSchema,
  validateTopicAnnouncementGroupId,
} from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
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

  const { normalizedWsId, sbAdmin } = access.context;
  const payload = parsed.data;
  const contactIds = [...new Set(payload.contactIds)];
  const { data: contacts, error: contactsError } = await sbAdmin
    .from('topic_announcement_contacts')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('archived', false)
    .in('id', contactIds);
  if (contactsError) throw contactsError;
  if ((contacts ?? []).length !== contactIds.length) {
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

  const { data: workspace, error: workspaceError } = await sbAdmin
    .from('workspaces')
    .select('name')
    .eq('id', normalizedWsId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  const attachments = payload.attachmentDrafts.map((attachment) => ({
    ...attachment,
    fileName: normalizeTopicAnnouncementAttachmentFileName(attachment.fileName),
  }));

  const content = renderTopicAnnouncementEmail({
    announcement: {
      body: payload.body,
      class_label: payload.classLabel,
      day_label: payload.dayLabel,
      end_time: payload.endTime ?? null,
      place: payload.place,
      room: payload.room,
      session_date: payload.sessionDate ?? null,
      start_time: payload.startTime ?? null,
      title: payload.title,
      topic: payload.topic,
    },
    attachments,
    workspaceName: workspace?.name ?? null,
  });

  return NextResponse.json({
    data: {
      ...content,
      attachments,
    },
  });
}
