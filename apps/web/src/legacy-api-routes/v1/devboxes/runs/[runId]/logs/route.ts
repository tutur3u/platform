import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { listDevboxRunLogs } from '@/lib/devboxes/store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const { runId } = await context.params;
  const rawOffset = request.nextUrl.searchParams.get('offset') ?? '0';
  const offset = /^\d{1,9}$/u.test(rawOffset) ? Number(rawOffset) : Number.NaN;
  if (!Number.isSafeInteger(offset))
    return NextResponse.json(
      { message: 'offset must be a non-negative integer' },
      { status: 400 }
    );

  try {
    return NextResponse.json(
      await listDevboxRunLogs({ actorId: authorization.user.id, offset, runId })
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Failed to list run logs');
  }
}
