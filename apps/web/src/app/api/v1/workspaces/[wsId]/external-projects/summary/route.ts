import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { getWorkspaceExternalProjectSummary } from '@/lib/external-projects/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const summary = await getWorkspaceExternalProjectSummary(
      {
        adapter: access.binding.adapter,
        canonicalProjectId: access.binding.canonical_id,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Failed to load external project summary', error);
    return NextResponse.json(
      { error: 'Failed to load external project summary' },
      { status: 500 }
    );
  }
}
