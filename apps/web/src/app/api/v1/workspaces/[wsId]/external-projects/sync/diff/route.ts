import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import {
  buildExternalProjectSyncDiff,
  getWorkspaceExternalProjectSyncSnapshot,
} from '@/lib/external-projects/sync';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { parseSyncManifestRequest } from '../shared';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function diffManifest(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const { manifest } = parseSyncManifestRequest(await request.json());
    const snapshot = await getWorkspaceExternalProjectSyncSnapshot(
      {
        binding: access.binding,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(buildExternalProjectSyncDiff(snapshot, manifest));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid external project sync manifest',
          details: error.flatten(),
        },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to diff external project sync manifest', {
      error: error instanceof Error ? error.message : String(error),
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to diff external project sync manifest' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/workspaces/[wsId]/external-projects/sync/diff',
    },
    () => diffManifest(request, context)
  );
}
