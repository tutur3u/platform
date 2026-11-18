import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { handleCitationValidate } from '@/lib/cite/format-api';

// The session wrapper adds IP blocking, suspension and adaptive controls; the
// handler keeps its own per-actor budget and body limits.
export const POST = withSessionAuth(
  async (request, auth) => {
    const response = await handleCitationValidate(request, {
      authenticate: async () => ({ ok: true, actorId: auth.user.id }),
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
  },
  { allowAppSessionAuth: true, maxPayloadSize: 96 * 1024 }
);
