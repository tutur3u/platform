import { NextResponse } from 'next/server';
import { requireRootExternalProjectsAdmin } from '@/lib/external-projects/access';
import { listWorkspaceExternalProjectBindingAudits } from '@/lib/external-projects/store';

export async function GET(request: Request) {
  const access = await requireRootExternalProjectsAdmin(request);
  if (!access.ok) return access.response;

  try {
    const audits = await listWorkspaceExternalProjectBindingAudits(
      access.admin
    );
    return NextResponse.json(audits);
  } catch (error) {
    console.error('Failed to load external project binding audits', error);
    return NextResponse.json(
      { error: 'Failed to load external project binding audits' },
      { status: 500 }
    );
  }
}
