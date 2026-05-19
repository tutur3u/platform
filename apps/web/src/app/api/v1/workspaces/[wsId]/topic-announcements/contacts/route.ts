import { NextResponse } from 'next/server';
import { getContactVerificationStatuses } from '../email';
import {
  normalizeEmail,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementContactSchema,
  validateTopicAnnouncementWorkspaceUserId,
} from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

function serializeContact(
  contact: {
    archived: boolean;
    created_at: string;
    email: string;
    id: string;
    metadata: unknown;
    name: string;
    tags: string[];
    workspace_user_id: string | null;
  },
  verificationStatus: string
) {
  return {
    archived: contact.archived,
    createdAt: contact.created_at,
    email: contact.email,
    id: contact.id,
    metadata: contact.metadata,
    name: contact.name,
    tags: contact.tags,
    verificationStatus,
    workspaceUserId: contact.workspace_user_id,
  };
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get('q')?.trim() ?? '';
  const includeArchived = searchParams.get('includeArchived') === 'true';
  const { normalizedWsId, sbAdmin } = access.context;

  let query = sbAdmin
    .from('topic_announcement_contacts')
    .select('*')
    .eq('ws_id', normalizedWsId)
    .order('name', { ascending: true });

  if (!includeArchived) query = query.eq('archived', false);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error } = await query.limit(500);
  if (error) throw error;

  const statuses = await getContactVerificationStatuses(
    sbAdmin,
    (data ?? []).map((contact: any) => contact.id)
  );

  return NextResponse.json({
    data: (data ?? []).map((contact: any) =>
      serializeContact(
        contact,
        statuses.get(contact.id) ?? 'needs_verification'
      )
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

  const parsed = TopicAnnouncementContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const payload = parsed.data;
  const email = normalizeEmail(payload.email);

  const { data: existing } = await sbAdmin
    .from('topic_announcement_contacts')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('email', email)
    .eq('archived', false)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { message: 'A contact with this email already exists' },
      { status: 409 }
    );
  }

  const invalidWorkspaceUser = await validateTopicAnnouncementWorkspaceUserId({
    normalizedWsId,
    sbAdmin,
    workspaceUserId: payload.workspaceUserId,
  });
  if (invalidWorkspaceUser) return invalidWorkspaceUser;

  const { data, error } = await sbAdmin
    .from('topic_announcement_contacts')
    .insert({
      archived: payload.archived ?? false,
      created_by: actorUserId,
      email,
      metadata: payload.metadata,
      name: payload.name,
      tags: payload.tags,
      updated_by: actorUserId,
      workspace_user_id: payload.workspaceUserId ?? null,
      ws_id: normalizedWsId,
    })
    .select('*')
    .single();
  if (error) throw error;

  return NextResponse.json(
    { data: serializeContact(data, 'needs_verification') },
    { status: 201 }
  );
}
