import { NextResponse } from 'next/server';
import { sendTopicAnnouncement } from '../../../email';
import {
  loadScopedTopicAnnouncement,
  resolveTopicAnnouncementsAccess,
  TopicAnnouncementSendSchema,
} from '../../../shared';

interface Params {
  params: Promise<{ announcementId: string; wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { announcementId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireSend: true,
    teacherAccess: 'send',
  });
  if (access.response) return access.response;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = TopicAnnouncementSendSchema.safeParse(body);
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
  const loaded = await loadScopedTopicAnnouncement({
    announcementId,
    columns: 'id',
    normalizedWsId,
    sbAdmin,
    scope,
  });
  if (loaded.response) return loaded.response;

  const result = await sendTopicAnnouncement({
    actorUserId,
    announcementId,
    normalizedWsId,
    request,
    resend: parsed.data.resend,
    sbAdmin,
  });

  if ('error' in result) {
    return NextResponse.json(
      { message: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result);
}
