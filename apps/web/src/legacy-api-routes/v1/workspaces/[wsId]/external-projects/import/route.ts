import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { runWorkspaceExternalProjectImport } from '@/lib/external-projects/store';

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
    const report = await runWorkspaceExternalProjectImport(
      {
        actorId: access.user.id,
        binding: access.binding,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(report);
  } catch (error) {
    console.error('Failed to import external project content', error);
    return NextResponse.json(
      { error: 'Failed to import external project content' },
      { status: 500 }
    );
  }
}
