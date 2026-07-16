import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import { processManagedAssetImportJob } from '@/lib/external-projects/managed-asset-import';

const privateHeaders = {
  'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string; wsId: string }> }
) {
  const { jobId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const parsedJobId = z.string().uuid().parse(jobId);
    const job = await processManagedAssetImportJob(
      access.normalizedWorkspaceId,
      parsedJobId,
      access.admin
    );
    after(async () => {
      if (job.status === 'queued') {
        await processManagedAssetImportJob(
          access.normalizedWorkspaceId,
          parsedJobId,
          access.admin
        ).catch((error) =>
          console.error('Managed asset import continuation failed', error)
        );
      }
    });
    return NextResponse.json(job, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid import job id' },
        { headers: privateHeaders, status: 400 }
      );
    }
    console.error('Failed to process managed asset import job', error);
    return NextResponse.json(
      { error: 'Failed to process managed asset import job' },
      { headers: privateHeaders, status: 500 }
    );
  }
}
