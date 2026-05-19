import { NextResponse } from 'next/server';
import {
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementPayloadSchema,
  type TopicAnnouncementsSupabaseClient,
  validateTopicAnnouncementGroupId,
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

export async function PATCH(request: Request, { params }: Params) {
  const { announcementId, wsId } = await params;
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

  const parsed = TopicAnnouncementPayloadSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const payload = parsed.data;

  if (payload.groupId !== undefined) {
    const invalidGroup = await validateTopicAnnouncementGroupId({
      groupId: payload.groupId,
      normalizedWsId,
      sbAdmin,
    });
    if (invalidGroup) return invalidGroup;
  }

  if (payload.contactIds) {
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

  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .update({
      ...(payload.body !== undefined ? { body: payload.body } : {}),
      ...(payload.classLabel !== undefined
        ? { class_label: payload.classLabel }
        : {}),
      ...(payload.dayLabel !== undefined
        ? { day_label: payload.dayLabel }
        : {}),
      ...(payload.endTime !== undefined ? { end_time: payload.endTime } : {}),
      ...(payload.groupId !== undefined ? { group_id: payload.groupId } : {}),
      ...(payload.place !== undefined ? { place: payload.place } : {}),
      ...(payload.room !== undefined ? { room: payload.room } : {}),
      ...(payload.sessionDate !== undefined
        ? { session_date: payload.sessionDate }
        : {}),
      ...(payload.sourceType !== undefined
        ? { source_type: payload.sourceType }
        : {}),
      ...(payload.startTime !== undefined
        ? { start_time: payload.startTime }
        : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.topic !== undefined ? { topic: payload.topic } : {}),
      updated_by: actorUserId,
    })
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .select('*')
    .maybeSingle();

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

  return NextResponse.json({ data });
}

export async function DELETE(request: Request, { params }: Params) {
  const { announcementId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .update({ status: 'cancelled', updated_by: actorUserId })
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
