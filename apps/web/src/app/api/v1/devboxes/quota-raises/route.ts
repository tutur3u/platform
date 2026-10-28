import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDevboxActor } from '@/lib/devboxes/authorization';
import { identityRpc } from '@/lib/devboxes/identity-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

const Input = z
  .object({
    limit: z.enum([
      'cpu_minutes_daily',
      'max_concurrent_boxes',
      'max_concurrent_runs',
      'egress_bytes_daily',
      'memory_mib',
      'disk_gib',
    ]),
    max: z.number().int().positive(),
    reason: z.string().min(1).max(1000),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export async function POST(request: Request) {
  const auth = await requireDevboxActor(request, { operation: 'mutate' });
  if (!auth.ok) return auth.response;
  const input = Input.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  try {
    return NextResponse.json(
      {
        id: await identityRpc('request_devbox_quota_raise', {
          p_user_id: auth.user.id,
          p_limit: input.data.limit,
          p_max: input.data.max,
          p_reason: input.data.reason,
          p_expires_at: input.data.expiresAt,
        }),
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Quota request unavailable');
  }
}
