import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { getWorkspaceExternalProjectSyncSnapshot } from '@/lib/external-projects/sync';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function getSnapshot(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const snapshot = await getWorkspaceExternalProjectSyncSnapshot(
      {
        binding: access.binding,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(snapshot);
  } catch (error) {
    serverLogger.error('Failed to load external project sync snapshot', {
      error: error instanceof Error ? error.message : String(error),
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to load external project sync snapshot' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/workspaces/[wsId]/external-projects/sync/snapshot',
    },
    () => getSnapshot(request, context)
  );
}
