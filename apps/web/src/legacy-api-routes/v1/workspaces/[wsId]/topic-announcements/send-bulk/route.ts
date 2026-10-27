import { NextResponse } from 'next/server';
import { withScheduleSendClaim } from '@/lib/topic-schedule/send-claim';
import { sendTopicAnnouncement } from '../email';
import {
  isTopicAnnouncementAssignedToScope,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementBulkSendSchema,
} from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireSend: true,
    teacherAccess: 'send',
  });
  if (access.response) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TopicAnnouncementBulkSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin, scope } = access.context;
  if (parsed.data.resend && scope?.kind === 'teacher') {
    return NextResponse.json(
      { message: 'Only supervisors can resend topics' },
      { status: 403 }
    );
  }
  const results = [];

  let assignedIds: Set<string> | null = null;
  if (scope?.kind === 'teacher') {
    const { data: rows, error } = await sbAdmin
      .from('topic_announcements')
      .select('id,group_id,teacher_workspace_user_id')
      .eq('ws_id', normalizedWsId)
      .in('id', parsed.data.announcementIds);
    if (error) throw error;
    assignedIds = new Set(
      (rows ?? [])
        .filter(
          (row: {
            group_id: string | null;
            teacher_workspace_user_id: string | null;
          }) => isTopicAnnouncementAssignedToScope(row, scope)
        )
        .map((row: { id: string }) => row.id)
    );
  }

  for (const announcementId of parsed.data.announcementIds) {
    if (assignedIds && !assignedIds.has(announcementId)) {
      results.push({
        announcementId,
        error: 'ANNOUNCEMENT_NOT_FOUND',
        status: 404,
      });
      continue;
    }
    const sendRequest = {
      announcementId,
      normalizedWsId,
      resend: parsed.data.resend,
      sbAdmin,
    };
    const result = await withScheduleSendClaim(sendRequest, () =>
      sendTopicAnnouncement({ ...sendRequest, actorUserId, request })
    );
    results.push({ announcementId, ...result });
  }

  return NextResponse.json({ results });
}
