import { NextResponse } from 'next/server';
import { sendTopicAnnouncement } from '../../../email';
import {
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

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
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
