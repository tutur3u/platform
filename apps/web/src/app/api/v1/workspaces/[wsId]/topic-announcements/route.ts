import { NextResponse } from 'next/server';
import {
  insertTopicAnnouncementAttachmentDrafts,
  mapTopicAnnouncementRow,
  resolveTopicAnnouncementsAccess,
  serializeTopicAnnouncementContacts,
  type TopicAnnouncementAttachmentRow,
  type TopicAnnouncementContactRow,
  TopicAnnouncementListQuerySchema,
  TopicAnnouncementPayloadSchema,
  type TopicAnnouncementsSupabaseClient,
  validateTopicAnnouncementGroupId,
} from './shared';

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

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const parsed = TopicAnnouncementListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { normalizedWsId, sbAdmin } = access.context;
  const { page, pageSize, q, status, contactId } = parsed.data;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = sbAdmin
    .from('topic_announcements')
    .select('*, group:workspace_user_groups(id, name)', { count: 'exact' })
    .eq('ws_id', normalizedWsId);

  if (status === 'active') {
    query = query.neq('status', 'cancelled');
  } else if (status !== 'all') {
    query = query.eq('status', status);
  }
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,topic.ilike.%${q}%,class_label.ilike.%${q}%`
    );
  }
  if (contactId) {
    const { data: recipientRows, error: recipientError } = await sbAdmin
      .from('topic_announcement_recipients')
      .select('announcement_id')
      .eq('contact_id', contactId);
    if (recipientError) throw recipientError;
    query = query.in(
      'id',
      (recipientRows ?? []).map((row: any) => row.announcement_id)
    );
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const announcementIds = (data ?? []).map((row: any) => row.id);
  const { data: recipients, error: recipientsError } = announcementIds.length
    ? await sbAdmin
        .from('topic_announcement_recipients')
        .select('announcement_id, contact:topic_announcement_contacts(*)')
        .in('announcement_id', announcementIds)
    : { data: [], error: null };
  if (recipientsError) throw recipientsError;

  const { data: attachments, error: attachmentsError } = announcementIds.length
    ? await sbAdmin
        .from('topic_announcement_attachments')
        .select(
          'id,content_type,created_at,file_name,size_bytes,storage_path,storage_provider,announcement_id'
        )
        .in('announcement_id', announcementIds)
        .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (attachmentsError) throw attachmentsError;

  const recipientsByAnnouncement = new Map<
    string,
    TopicAnnouncementContactRow[]
  >();
  const attachmentsByAnnouncement = new Map<
    string,
    TopicAnnouncementAttachmentRow[]
  >();
  const allContacts: TopicAnnouncementContactRow[] = [];
  for (const row of recipients ?? []) {
    if (!row.contact) continue;
    const contact = row.contact as TopicAnnouncementContactRow;
    const list = recipientsByAnnouncement.get(row.announcement_id) ?? [];
    list.push(contact);
    recipientsByAnnouncement.set(row.announcement_id, list);
    allContacts.push(contact);
  }
  for (const row of attachments ?? []) {
    const list = attachmentsByAnnouncement.get(row.announcement_id) ?? [];
    list.push(row as TopicAnnouncementAttachmentRow);
    attachmentsByAnnouncement.set(row.announcement_id, list);
  }

  const serializedById = new Map(
    (await serializeTopicAnnouncementContacts(sbAdmin, allContacts)).map(
      (contact) => [contact.id, contact]
    )
  );

  return NextResponse.json({
    count: count ?? 0,
    data: (data ?? []).map((announcement: any) =>
      mapTopicAnnouncementRow({
        ...announcement,
        attachments: attachmentsByAnnouncement.get(announcement.id) ?? [],
        contacts: (recipientsByAnnouncement.get(announcement.id) ?? []).map(
          (contact) => serializedById.get(contact.id) ?? contact
        ),
      })
    ),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
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

  const parsed = TopicAnnouncementPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const payload = parsed.data;
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

  const { data: announcement, error } = await sbAdmin
    .from('topic_announcements')
    .insert({
      body: payload.body,
      class_label: payload.classLabel,
      created_by: actorUserId,
      day_label: payload.dayLabel,
      end_time: payload.endTime ?? null,
      group_id: payload.groupId ?? null,
      place: payload.place,
      room: payload.room,
      session_date: payload.sessionDate ?? null,
      source_type: payload.sourceType,
      start_time: payload.startTime ?? null,
      status: payload.status ?? 'draft',
      title: payload.title,
      topic: payload.topic,
      updated_by: actorUserId,
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
    .select('*, group:workspace_user_groups(id, name)')
    .eq('id', announcement.id)
    .maybeSingle();
  if (enrichedError) throw enrichedError;

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
        ...(enrichedAnnouncement ?? announcement),
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
