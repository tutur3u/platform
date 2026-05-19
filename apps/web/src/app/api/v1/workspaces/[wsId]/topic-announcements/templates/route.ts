import { NextResponse } from 'next/server';
import {
  mapTopicAnnouncementTemplateRow,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementTemplateSchema,
  validateTopicAnnouncementGroupId,
  validateTopicAnnouncementTemplateContactIds,
} from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const { normalizedWsId, sbAdmin } = access.context;
  const { data, error } = await sbAdmin
    .from('topic_announcement_templates')
    .select('*, group:workspace_user_groups(id, name)')
    .eq('ws_id', normalizedWsId)
    .order('name', { ascending: true });

  if (error) throw error;

  return NextResponse.json({
    data: (data ?? []).map((row: Record<string, unknown>) =>
      mapTopicAnnouncementTemplateRow(row)
    ),
  });
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

  const parsed = TopicAnnouncementTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const payload = parsed.data;

  const invalidGroup = await validateTopicAnnouncementGroupId({
    groupId: payload.groupId,
    normalizedWsId,
    sbAdmin,
  });
  if (invalidGroup) return invalidGroup;

  const invalidContacts = await validateTopicAnnouncementTemplateContactIds({
    contactIds: payload.defaultContactIds,
    normalizedWsId,
    sbAdmin,
  });
  if (invalidContacts) return invalidContacts;

  const { data, error } = await sbAdmin
    .from('topic_announcement_templates')
    .insert({
      class_label: payload.classLabel,
      created_by: actorUserId,
      day_label: payload.dayLabel,
      default_contact_ids: payload.defaultContactIds,
      end_time: payload.endTime ?? null,
      group_id: payload.groupId ?? null,
      name: payload.name,
      place: payload.place,
      room: payload.room,
      session_date: payload.sessionDate ?? null,
      start_time: payload.startTime ?? null,
      title: payload.title,
      topic: payload.topic,
      updated_by: actorUserId,
      ws_id: normalizedWsId,
    })
    .select('*, group:workspace_user_groups(id, name)')
    .single();

  if (error) throw error;

  return NextResponse.json(
    { data: mapTopicAnnouncementTemplateRow(data) },
    { status: 201 }
  );
}
