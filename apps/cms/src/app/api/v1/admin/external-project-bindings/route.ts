import { NextResponse } from 'next/server';
import { requireCmsRootExternalProjectsAdmin } from '@/lib/external-projects/admin-access';
import { listExternalProjectWorkspaceBindingSummaries } from '@/lib/external-projects/admin-store';
import { adminRouteErrorResponse } from '../_shared';

export async function GET() {
  const access = await requireCmsRootExternalProjectsAdmin();
  if (!access.ok) return access.response;

  try {
    const summaries = await listExternalProjectWorkspaceBindingSummaries(
      access.admin
    );
    return NextResponse.json(summaries);
  } catch (error) {
    return adminRouteErrorResponse(error, 'Failed to list site projects');
  }
}
