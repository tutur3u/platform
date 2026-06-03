import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { listDevboxRunLogs } from '@/lib/devboxes/store';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const { runId } = await context.params;

  try {
    return NextResponse.json(await listDevboxRunLogs(runId));
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Failed to list run logs',
      },
      { status: 500 }
    );
  }
}
