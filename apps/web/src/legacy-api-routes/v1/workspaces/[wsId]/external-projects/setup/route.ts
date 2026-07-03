import type { ExternalProjectSyncSchema } from '@tuturuuu/types';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ensureWorkspaceExternalProjectStudio,
  requireWorkspaceExternalProjectSetupAccess,
} from '@/lib/external-projects/access';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { syncManifestSchema } from '../sync/shared';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const setupRequestSchema = z
  .object({
    adapter: syncManifestSchema.shape.adapter.optional(),
    manifest: syncManifestSchema.optional(),
    schema: syncManifestSchema.shape.schema.optional(),
  })
  .refine((value) => value.adapter || value.manifest, {
    message: 'adapter or manifest is required',
    path: ['adapter'],
  });

async function setupExternalProjectStudio(
  request: NextRequest,
  { params }: Params
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectSetupAccess({
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const payload = setupRequestSchema.parse(await request.json());
    const manifest = payload.manifest;
    const adapter = payload.adapter ?? manifest?.adapter;

    if (!adapter) {
      return NextResponse.json(
        { error: 'adapter or manifest is required' },
        { status: 400 }
      );
    }

    const schema = (payload.schema ?? manifest?.schema) as
      | ExternalProjectSyncSchema
      | undefined;
    const result = await ensureWorkspaceExternalProjectStudio({
      actorId: access.user.id,
      adapter,
      admin: access.admin,
      schema,
      workspaceId: access.normalizedWorkspaceId,
    });

    return NextResponse.json({
      ...result,
      autoSetup: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid external project setup payload',
          details: error.flatten(),
        },
        { status: 400 }
      );
    }

    if (
      error instanceof Error &&
      (error.message.includes('already configured') ||
        error.message.includes('already uses') ||
        error.message.includes('inactive') ||
        error.message.includes('Root workspace'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    serverLogger.error('Failed to auto-setup external project studio', {
      error: error instanceof Error ? error.message : String(error),
      wsId: access.normalizedWorkspaceId,
    });
    return NextResponse.json(
      { error: 'Failed to auto-setup external project studio' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/workspaces/[wsId]/external-projects/setup',
    },
    () => setupExternalProjectStudio(request, context)
  );
}
