import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { duplicateWorkspaceExternalProjectEntry } from '@/lib/external-projects/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entryId: string; wsId: string }> }
) {
  const { entryId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const entry = await duplicateWorkspaceExternalProjectEntry(
      {
        actorId: access.user.id,
        entryId,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error(
      'Failed to duplicate workspace external project entry',
      error
    );
    return NextResponse.json(
      { error: 'Failed to duplicate workspace external project entry' },
      { status: 500 }
    );
  }
}
