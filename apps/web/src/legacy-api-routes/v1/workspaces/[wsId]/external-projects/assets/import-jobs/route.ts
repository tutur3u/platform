import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import {
  createManagedAssetImportJob,
  ManagedAssetImportValidationError,
} from '@/lib/external-projects/managed-asset-import';

const schema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(500),
});
const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const payload = schema.parse(await request.json());
    if (!access.binding.adapter || !access.binding.canonical_id) {
      return NextResponse.json(
        { error: 'Workspace external project binding is incomplete' },
        { headers: privateHeaders, status: 409 }
      );
    }
    const job = await createManagedAssetImportJob(
      {
        actorId: access.user.id,
        adapter: access.binding.adapter,
        assetIds: payload.assetIds,
        canonicalProjectId: access.binding.canonical_id,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );
    return NextResponse.json(job, { headers: privateHeaders, status: 201 });
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      error instanceof ManagedAssetImportValidationError
    ) {
      return NextResponse.json(
        {
          ...(error instanceof z.ZodError ? { details: error.flatten() } : {}),
          error: 'Invalid import job',
        },
        { headers: privateHeaders, status: 400 }
      );
    }
    console.error('Failed to create managed asset import job', error);
    return NextResponse.json(
      { error: 'Failed to create import job' },
      { headers: privateHeaders, status: 500 }
    );
  }
}
