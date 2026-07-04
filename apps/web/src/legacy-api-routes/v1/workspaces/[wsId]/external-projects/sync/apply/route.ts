import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { applyWorkspaceExternalProjectSyncManifest } from '@/lib/external-projects/sync';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { parseSyncManifestRequest } from '../shared';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function applyManifest(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const { force, manifest } = parseSyncManifestRequest(await request.json());
    const result = await applyWorkspaceExternalProjectSyncManifest(
      {
        actorId: access.user.id,
        binding: access.binding,
        force: force === true,
        manifest,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(result);
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

    if (
      error instanceof Error &&
      error.message.includes('destructive operations')
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('Failed to apply external project sync manifest', {
      error: error instanceof Error ? error.message : String(error),
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to apply external project sync manifest' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/workspaces/[wsId]/external-projects/sync/apply',
    },
    () => applyManifest(request, context)
  );
}
