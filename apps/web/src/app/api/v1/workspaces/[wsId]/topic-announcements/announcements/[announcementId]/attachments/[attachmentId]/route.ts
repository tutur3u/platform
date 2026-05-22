import { NextResponse } from 'next/server';
import { resolveTopicAnnouncementsAccess } from '../../../../shared';

interface Params {
  params: Promise<{
    announcementId: string;
    attachmentId: string;
    wsId: string;
  }>;
}

export async function DELETE(request: Request, { params }: Params) {
  const { announcementId, attachmentId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const { normalizedWsId, sbAdmin } = access.context;
  const { data: announcement, error: announcementError } = await sbAdmin
    .from('topic_announcements')
    .select('id,status')
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();
  if (announcementError) throw announcementError;
  if (!announcement) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (announcement.status === 'sent') {
    return NextResponse.json(
      { message: 'Sent announcement attachments cannot be removed' },
      { status: 409 }
    );
  }

  const { data, error } = await sbAdmin
    .from('topic_announcement_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('announcement_id', announcementId)
    .eq('ws_id', normalizedWsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
