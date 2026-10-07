import { NextResponse } from 'next/server';
import { normalizeTopicAnnouncementAttachmentFileName } from './attachments';
import { renderTopicAnnouncementEmail } from './email-renderer';
import {
  attachTopicAnnouncementGroups,
  getPublicSchemaClient,
  mapTopicAnnouncementRow,
  serializeTopicAnnouncementContacts,
  type TopicAnnouncementAttachmentRow,
  type TopicAnnouncementContactRow,
  type TopicAnnouncementsAccessContext,
  validateTopicAnnouncementGroupId,
} from './read-helpers';
import {
  TopicAnnouncementListQuerySchema,
  TopicAnnouncementPayloadSchema,
} from './schemas';

interface Params {
  params: Promise<{ wsId: string }>;
}
export type TopicAnnouncementAccessResolver = (
  request: Request,
  wsId: string,
  options: { requireManage?: boolean; requireSend?: boolean }
) => Promise<
  | { response: Response; context?: never }
  | { response?: never; context: TopicAnnouncementsAccessContext }
>;

export function createTopicAnnouncementListHandler(
  resolveTopicAnnouncementsAccess: TopicAnnouncementAccessResolver
) {
  return async function GET(request: Request, { params }: Params) {
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
      .select('*', { count: 'exact' })
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

    const { data: attachments, error: attachmentsError } =
      announcementIds.length
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

    const announcementsWithGroups = await attachTopicAnnouncementGroups(
      sbAdmin,
      data ?? []
    );

    return NextResponse.json({
      count: count ?? 0,
      data: announcementsWithGroups.map((announcement: any) =>
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
  };
}
export function createTopicAnnouncementPreviewHandler(
  resolveTopicAnnouncementsAccess: TopicAnnouncementAccessResolver
) {
  return async function POST(request: Request, { params }: Params) {
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

    const publicAdmin = getPublicSchemaClient(sbAdmin);
    const { data: workspace, error: workspaceError } = await publicAdmin
      .from('workspaces')
      .select('name')
      .eq('id', normalizedWsId)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    const attachments = payload.attachmentDrafts.map((attachment) => ({
      ...attachment,
      fileName: normalizeTopicAnnouncementAttachmentFileName(
        attachment.fileName
      ),
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
  };
}
