import { NextResponse } from 'next/server';
import { requireRootExternalProjectsAdmin } from '@/lib/external-projects/access';
import { listExternalProjectWorkspaceBindingSummaries } from '@/lib/external-projects/store';

export async function GET(request: Request) {
  const access = await requireRootExternalProjectsAdmin(request);
  if (!access.ok) return access.response;

  try {
    const summaries = await listExternalProjectWorkspaceBindingSummaries(
      access.admin
    );
    return NextResponse.json(summaries);
  } catch (error) {
    console.error('Failed to load external project workspace bindings', error);
    return NextResponse.json(
      { error: 'Failed to load external project workspace bindings' },
      { status: 500 }
    );
  }
}
