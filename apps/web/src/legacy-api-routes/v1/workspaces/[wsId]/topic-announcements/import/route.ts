import { NextResponse } from 'next/server';
import {
  computeTopicAnnouncementSendDueAt,
  getWorkspaceSchedulingTimezone,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementImportSchema,
} from '../shared';
import { normalizeImportRows, validateImportTeacherIds } from './import-rows';

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

  const parsed = TopicAnnouncementImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin, teacherAssignmentsEnabled } =
    access.context;
  const enabled = teacherAssignmentsEnabled === true;
  // Teacher ids and topic-less schedule rows are part of teacher-assigned
  // topics; with the flag off the import behaves as before.
  if (enabled) {
    const teacherResponse = await validateImportTeacherIds({
      normalizedWsId,
      rows: parsed.data.rows.map((row, index) => ({
        rowNumber: index + 1,
        teacherWorkspaceUserId: row.teacherWorkspaceUserId ?? null,
      })),
      sbAdmin,
    });
    if (teacherResponse) return teacherResponse;
  }

  const { rowErrors, validRows } = normalizeImportRows(parsed.data.rows, {
    teacherAssignments: enabled,
  });

  if (validRows.length === 0) {
    return NextResponse.json({
      announcementIds: [],
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

  // send_due_at: 24h before the session in the workspace timezone, from the
  // normalized date and start time (teacher assignments only).
  const timezone = enabled
    ? await getWorkspaceSchedulingTimezone(sbAdmin, normalizedWsId)
    : null;
  const { data: announcements, error: announcementError } = await sbAdmin
    .from('topic_announcements')
    .insert(
      validRows.map((row) => ({
        batch_id: batch.id,
        body: '',
        class_label: row.classLabel,
        created_by: actorUserId,
        day_label: row.dayLabel,
        end_time: row.endTime,
        place: row.place,
        room: row.room,
        send_due_at: enabled
          ? computeTopicAnnouncementSendDueAt({
              sessionDate: row.sessionDate,
              startTime: row.startTime,
              timeZone: timezone,
            })
          : null,
        session_date: row.sessionDate,
        source_row_number: row.rowNumber,
        source_type: parsed.data.sourceType,
        start_time: row.startTime,
        status: 'draft',
        teacher_workspace_user_id: row.teacherWorkspaceUserId,
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
    announcementIds: (announcements ?? []).map(
      (announcement: any) => announcement.id
    ),
    batchId: batch.id,
    createdAnnouncements: announcements?.length ?? 0,
    createdContacts: missingContacts.length,
    rowErrors,
  });
}
