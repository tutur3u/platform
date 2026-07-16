import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import { getManagedAssetImportJob } from '@/lib/external-projects/managed-asset-import';

const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string; wsId: string }> }
) {
  const { jobId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const job = await getManagedAssetImportJob(
      access.normalizedWorkspaceId,
      z.string().uuid().parse(jobId),
      access.admin
    );
    return NextResponse.json(job, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid import job id' },
        { headers: privateHeaders, status: 400 }
      );
    }
    console.error('Failed to get managed asset import job', error);
    return NextResponse.json(
      { error: 'Managed asset import job not found' },
      { headers: privateHeaders, status: 404 }
    );
  }
}
