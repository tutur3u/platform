import { NextResponse } from 'next/server';
import { requireDevboxActor } from '@/lib/devboxes/authorization';
import {
  IssueTokenSchema,
  identityRpc,
  issueDevboxAccessToken,
} from '@/lib/devboxes/identity-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const auth = await requireDevboxActor(request, { operation: 'tokens' });
  if (!auth.ok) return auth.response;
  try {
    return json({
      tokens: await identityRpc('list_devbox_access_tokens', {
        p_user_id: auth.user.id,
      }),
    });
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Failed to list agent tokens');
  }
}
export async function POST(request: Request) {
  const auth = await requireDevboxActor(request, {
    operation: 'tokens',
    stepUp: true,
  });
  if (!auth.ok) return auth.response;
  const parsed = IssueTokenSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success || auth.issuedAt === null)
    return json({ message: 'Invalid token request' }, 400);
  try {
    return json(
      await issueDevboxAccessToken(
        auth.user.id,
        auth.issuedAt,
        parsed.data,
        auth.authentication === 'cli'
      ),
      201
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to create agent token'
    );
  }
}
