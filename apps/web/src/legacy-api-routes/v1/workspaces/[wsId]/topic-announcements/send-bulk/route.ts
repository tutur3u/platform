import { NextResponse } from 'next/server';
import { sendTopicAnnouncement } from '../email';
import {
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

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const results = [];

  for (const announcementId of parsed.data.announcementIds) {
    const result = await sendTopicAnnouncement({
      actorUserId,
      announcementId,
      normalizedWsId,
      request,
      resend: parsed.data.resend,
      sbAdmin,
    });
    results.push({ announcementId, ...result });
  }

  return NextResponse.json({ results });
}
