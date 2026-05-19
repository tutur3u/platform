import { NextResponse } from 'next/server';
import {
  normalizeEmail,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementImportSchema,
} from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

function normalizeTime(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/iu
  );
  if (!match) return null;

  const [, hourRaw = '0', minuteRaw = '0', meridiemRaw] = match;
  let hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (minute < 0 || minute > 59) return null;

  const meridiem = meridiemRaw?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
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

  const parsed = TopicAnnouncementImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const rowErrors: { message: string; rowNumber: number }[] = [];
  const validRows = parsed.data.rows.flatMap((row, index) => {
    const rowNumber = index + 1;
    const contactEmail = row.contactEmail
      ? normalizeEmail(row.contactEmail)
      : null;
    const topic = row.topic?.trim();

    if (!contactEmail) {
      rowErrors.push({ message: 'Missing contact email', rowNumber });
    }
    if (!topic) {
      rowErrors.push({ message: 'Missing topic', rowNumber });
    }

    if (!contactEmail || !topic) return [];

    return [
      {
        ...row,
        contactEmail,
        contactName: row.contactName?.trim() || contactEmail,
        endTime: normalizeTime(row.endTime),
        rowNumber,
        startTime: normalizeTime(row.startTime),
        title: row.title?.trim() || topic.slice(0, 120),
        topic,
      },
    ];
  });

  if (validRows.length === 0) {
    return NextResponse.json({
      createdAnnouncements: 0,
      createdContacts: 0,
      rowErrors,
    });
  }

  const emails = [...new Set(validRows.map((row) => row.contactEmail))];
  const { data: existingContacts, error: existingError } = await sbAdmin
    .from('topic_announcement_contacts')
    .select('id,email')
    .eq('ws_id', normalizedWsId)
    .eq('archived', false)
    .in('email', emails);
  if (existingError) throw existingError;

  const contactByEmail = new Map(
    (existingContacts ?? []).map((contact: any) => [contact.email, contact.id])
  );
  const missingContacts = emails
    .filter((email) => !contactByEmail.has(email))
    .map((email) => {
      const sourceRow = validRows.find((row) => row.contactEmail === email);
      return {
        created_by: actorUserId,
        email,
        metadata: { sourceType: parsed.data.sourceType },
        name: sourceRow?.contactName || email,
        tags: [parsed.data.sourceType],
        updated_by: actorUserId,
        ws_id: normalizedWsId,
      };
    });

  if (missingContacts.length > 0) {
    const { data: insertedContacts, error: insertContactsError } = await sbAdmin
      .from('topic_announcement_contacts')
      .insert(missingContacts)
      .select('id,email');
    if (insertContactsError) throw insertContactsError;
    for (const contact of insertedContacts ?? []) {
      contactByEmail.set(contact.email, contact.id);
    }
  }

  const { data: batch, error: batchError } = await sbAdmin
    .from('topic_announcement_batches')
    .insert({
      created_by: actorUserId,
      row_count: validRows.length,
      source_name: parsed.data.sourceName ?? null,
      source_type: parsed.data.sourceType,
      ws_id: normalizedWsId,
    })
    .select('id')
    .single();
  if (batchError) throw batchError;

  const { data: announcements, error: announcementError } = await sbAdmin
    .from('topic_announcements')
    .insert(
      validRows.map((row) => ({
        batch_id: batch.id,
        body: '',
        class_label: row.classLabel?.trim() || null,
        created_by: actorUserId,
        day_label: row.dayLabel?.trim() || null,
        end_time: row.endTime,
        place: row.place?.trim() || null,
        room: row.room?.trim() || null,
        session_date: row.sessionDate ?? null,
        source_row_number: row.rowNumber,
        source_type: parsed.data.sourceType,
        start_time: row.startTime,
        status: 'draft',
        title: row.title,
        topic: row.topic,
        updated_by: actorUserId,
        ws_id: normalizedWsId,
      }))
    )
    .select('id,source_row_number');
  if (announcementError) throw announcementError;

  const recipients = (announcements ?? []).flatMap((announcement: any) => {
    const sourceRow = validRows.find(
      (row) => row.rowNumber === announcement.source_row_number
    );
    const contactId = sourceRow
      ? contactByEmail.get(sourceRow.contactEmail)
      : undefined;
    return contactId
      ? [{ announcement_id: announcement.id, contact_id: contactId }]
      : [];
  });

  if (recipients.length > 0) {
    const { error: recipientsError } = await sbAdmin
      .from('topic_announcement_recipients')
      .insert(recipients);
    if (recipientsError) throw recipientsError;
  }

  return NextResponse.json({
    batchId: batch.id,
    createdAnnouncements: announcements?.length ?? 0,
    createdContacts: missingContacts.length,
    rowErrors,
  });
}
