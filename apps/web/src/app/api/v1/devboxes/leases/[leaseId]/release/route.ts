import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { releaseDevboxLease } from '@/lib/devboxes/store';

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
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to release devbox lease',
      },
      { status: 500 }
    );
  }
}
