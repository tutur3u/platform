import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { releaseDevboxLease } from '@/lib/devboxes/store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ leaseId: string }> }
) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const { leaseId } = await context.params;

  try {
    return NextResponse.json(await releaseDevboxLease(leaseId));
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to release devbox lease'
    );
  }
}
