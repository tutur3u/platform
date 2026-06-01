import { NextResponse } from 'next/server';
import { requireCmsRootExternalProjectsAdmin } from '@/lib/external-projects/admin-access';
import { listWorkspaceExternalProjectBindingAudits } from '@/lib/external-projects/admin-store';
import { adminRouteErrorResponse } from '../_shared';

export async function GET() {
  const access = await requireCmsRootExternalProjectsAdmin();
  if (!access.ok) return access.response;

  try {
    const audits = await listWorkspaceExternalProjectBindingAudits(
      access.admin
    );
    return NextResponse.json(audits);
  } catch (error) {
    return adminRouteErrorResponse(error, 'Failed to list connection history');
  }
}
