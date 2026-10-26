import { NextResponse } from 'next/server';
import {
  loadScopedTopicAnnouncement,
  resolveTopicAnnouncementsAccess,
} from '../../../../shared';

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
    teacherAccess: 'update',
  });
  if (access.response) return access.response;

  const { normalizedWsId, sbAdmin, scope } = access.context;
  const loaded = await loadScopedTopicAnnouncement<{ status: string }>({
    announcementId,
    columns: 'id,status',
    normalizedWsId,
    sbAdmin,
    scope,
  });
  if (loaded.response) return loaded.response;
  if (loaded.row.status === 'sent') {
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
