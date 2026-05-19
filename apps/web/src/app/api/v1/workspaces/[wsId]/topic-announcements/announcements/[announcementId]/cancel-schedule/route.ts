import { NextResponse } from 'next/server';
import { resolveTopicAnnouncementsAccess } from '../../../shared';

interface Params {
  params: Promise<{ announcementId: string; wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { announcementId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireSend: true,
  });
  if (access.response) return access.response;

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .update({
      last_error: null,
      scheduled_send_at: null,
      status: 'draft',
      updated_by: actorUserId,
    })
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .eq('status', 'queued')
    .select('id, status')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json(
      { message: 'No scheduled announcement found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ data });
}
