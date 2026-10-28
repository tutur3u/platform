import { NextResponse } from 'next/server';
import { requireDevboxActor } from '@/lib/devboxes/authorization';
import { identityRpc } from '@/lib/devboxes/identity-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';
export async function POST(request: Request) {
  const auth = await requireDevboxActor(request, {
    operation: 'accept',
    stepUp: true,
  });
  if (!auth.ok) return auth.response;
  try {
    const accepted = await identityRpc('accept_devbox_personal_grant', {
      p_user_id: auth.user.id,
    });
    return NextResponse.json(
      { accepted: accepted === true },
      {
        status: accepted === true ? 200 : 409,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Failed to accept grant');
  }
}
