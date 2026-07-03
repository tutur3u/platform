import { NextResponse } from 'next/server';
import { sendTopicVerificationEmail } from '../../../email';
import { resolveTopicAnnouncementsAccess } from '../../../shared';

interface Params {
  params: Promise<{ contactId: string; wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { contactId, wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireSend: true,
  });
  if (access.response) return access.response;

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const { data: contact, error } = await sbAdmin
    .from('topic_announcement_contacts')
    .select('id,name,email')
    .eq('id', contactId)
    .eq('ws_id', normalizedWsId)
    .eq('archived', false)
    .maybeSingle();
  if (error) throw error;
  if (!contact) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const result = await sendTopicVerificationEmail({
    contact,
    normalizedWsId,
    request,
    sbAdmin,
    userId: actorUserId,
  });

  if ('error' in result) {
    const retryAfter = 'retryAfter' in result ? result.retryAfter : undefined;

    return NextResponse.json(
      { message: result.error },
      {
        headers: retryAfter
          ? { 'Retry-After': retryAfter.toString() }
          : undefined,
        status: result.status,
      }
    );
  }

  return NextResponse.json({
    alreadyPending: result.alreadyPending,
    expiresAt: result.expiresAt,
  });
}
