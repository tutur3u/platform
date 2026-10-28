import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxRootAdmin } from '@/lib/devboxes/authorization';
import {
  createDevboxRouteErrorResponse,
  createPrivateDevboxClient,
} from '@/lib/devboxes/store-utils';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeDevboxRootAdmin(request);
  if (!auth.ok) return auth.response;
  const id = z.uuid().safeParse((await context.params).id);
  const body = z
    .object({ approve: z.boolean() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  try {
    const client = await createPrivateDevboxClient();
    const { data, error } = await client.rpc('decide_devbox_quota_raise', {
      p_id: id.data,
      p_admin_id: auth.user.id,
      p_approve: body.data.approve,
    });
    if (error) throw new Error('Quota decision unavailable');
    return NextResponse.json(
      { decided: data === true },
      {
        status: data === true ? 200 : 404,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Quota decision unavailable');
  }
}
