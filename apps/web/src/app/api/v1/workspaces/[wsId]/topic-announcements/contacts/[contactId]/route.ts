import { NextResponse } from 'next/server';
import { getContactVerificationStatuses } from '../../email';
import {
  normalizeEmail,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementContactSchema,
} from '../../shared';

interface Params {
  params: Promise<{ contactId: string; wsId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  const { contactId, wsId } = await params;
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

  const parsed = TopicAnnouncementContactSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const payload = parsed.data;
  const email = payload.email ? normalizeEmail(payload.email) : undefined;

  const { data, error } = await sbAdmin
    .from('topic_announcement_contacts')
    .update({
      ...(payload.archived !== undefined ? { archived: payload.archived } : {}),
      ...(email ? { email } : {}),
      ...(payload.metadata ? { metadata: payload.metadata } : {}),
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.tags ? { tags: payload.tags } : {}),
      ...(payload.workspaceUserId !== undefined
        ? { workspace_user_id: payload.workspaceUserId }
        : {}),
      updated_by: actorUserId,
    })
    .eq('id', contactId)
    .eq('ws_id', normalizedWsId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  if (email) {
    await sbAdmin
      .from('topic_announcement_contact_verifications')
      .update({ status: 'revoked' })
      .eq('contact_id', contactId)
      .neq('email', email)
      .in('status', ['pending', 'verified']);
  }

  const statuses = await getContactVerificationStatuses(sbAdmin, [contactId]);
  return NextResponse.json({
    data: {
      archived: data.archived,
      createdAt: data.created_at,
      email: data.email,
      id: data.id,
      metadata: data.metadata,
      name: data.name,
      tags: data.tags,
      verificationStatus: statuses.get(contactId) ?? 'needs_verification',
      workspaceUserId: data.workspace_user_id,
    },
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { contactId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const { data, error } = await sbAdmin
    .from('topic_announcement_contacts')
    .update({ archived: true, updated_by: actorUserId })
    .eq('id', contactId)
    .eq('ws_id', normalizedWsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
