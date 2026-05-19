import { NextResponse } from 'next/server';
import {
  mapTopicAnnouncementTemplateRow,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementTemplateSchema,
  validateTopicAnnouncementGroupId,
  validateTopicAnnouncementTemplateContactIds,
} from '../../shared';

interface Params {
  params: Promise<{ templateId: string; wsId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  const { templateId, wsId } = await params;
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

  const parsed = TopicAnnouncementTemplateSchema.partial().safeParse(body);
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

  if (payload.defaultContactIds) {
    const invalidContacts = await validateTopicAnnouncementTemplateContactIds({
      contactIds: payload.defaultContactIds,
      normalizedWsId,
      sbAdmin,
    });
    if (invalidContacts) return invalidContacts;
  }

  const { data, error } = await sbAdmin
    .from('topic_announcement_templates')
    .update({
      ...(payload.classLabel !== undefined
        ? { class_label: payload.classLabel }
        : {}),
      ...(payload.dayLabel !== undefined
        ? { day_label: payload.dayLabel }
        : {}),
      ...(payload.defaultContactIds !== undefined
        ? { default_contact_ids: payload.defaultContactIds }
        : {}),
      ...(payload.groupId !== undefined ? { group_id: payload.groupId } : {}),
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.place !== undefined ? { place: payload.place } : {}),
      ...(payload.room !== undefined ? { room: payload.room } : {}),
      ...(payload.sessionDate !== undefined
        ? { session_date: payload.sessionDate }
        : {}),
      ...(payload.startTime !== undefined
        ? { start_time: payload.startTime }
        : {}),
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.topic !== undefined ? { topic: payload.topic } : {}),
      updated_by: actorUserId,
    })
    .eq('id', templateId)
    .eq('ws_id', normalizedWsId)
    .select('*, group:workspace_user_groups(id, name)')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ data: mapTopicAnnouncementTemplateRow(data) });
}

export async function DELETE(request: Request, { params }: Params) {
  const { templateId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const { normalizedWsId, sbAdmin } = access.context;
  const { data, error } = await sbAdmin
    .from('topic_announcement_templates')
    .delete()
    .eq('id', templateId)
    .eq('ws_id', normalizedWsId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
