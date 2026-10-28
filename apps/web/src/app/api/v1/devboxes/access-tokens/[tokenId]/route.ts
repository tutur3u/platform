import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDevboxActor } from '@/lib/devboxes/authorization';
import { identityRpc } from '@/lib/devboxes/identity-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';
export async function DELETE(
  request: Request,
  context: { params: Promise<{ tokenId: string }> }
) {
  const auth = await requireDevboxActor(request, { operation: 'tokens' });
  if (!auth.ok) return auth.response;
  const id = z.uuid().safeParse((await context.params).tokenId);
  if (!id.success)
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  try {
    const revoked = await identityRpc('revoke_devbox_access_token', {
      p_id: id.data,
      p_user_id: auth.user.id,
    });
    return NextResponse.json(
      { revoked: revoked === true },
      {
        status: revoked === true ? 200 : 404,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to revoke agent token'
    );
  }
}
