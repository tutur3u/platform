import { NextResponse } from 'next/server';
import {
  getWorkspaceSchedulingTimezone,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementScheduleSchema,
} from '../../../shared';

interface Params {
  params: Promise<{ announcementId: string; wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { announcementId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireSend: true,
  });
  if (access.response) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TopicAnnouncementScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const timezone = await getWorkspaceSchedulingTimezone(
    access.context.sbAdmin,
    access.context.normalizedWsId
  );
  if (!timezone) {
    return NextResponse.json(
      { message: 'WORKSPACE_TIMEZONE_REQUIRED' },
      { status: 409 }
    );
  }

  const scheduledAt = new Date(parsed.data.scheduledSendAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json(
      { message: 'Invalid scheduled send time' },
      { status: 400 }
    );
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { message: 'Scheduled send time must be in the future' },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .update({
      last_error: null,
      scheduled_send_at: scheduledAt.toISOString(),
      status: 'queued',
      updated_by: actorUserId,
    })
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .in('status', ['draft', 'queued', 'failed', 'skipped'])
    .select('id, scheduled_send_at, status')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json(
      { message: 'Announcement cannot be scheduled' },
      { status: 409 }
    );
  }

  return NextResponse.json({
    data: {
      id: data.id,
      scheduledSendAt: data.scheduled_send_at,
      status: data.status,
    },
    timezone,
  });
}
