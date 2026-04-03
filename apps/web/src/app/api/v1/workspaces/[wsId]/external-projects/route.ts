import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { getWorkspaceExternalProjectStudioData } from '@/lib/external-projects/store';

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
    const studio = await getWorkspaceExternalProjectStudioData(
      access.normalizedWorkspaceId,
      access.admin
    );

    return NextResponse.json({
      binding: access.binding,
      ...studio,
    });
  } catch (error) {
    console.error('Failed to load external project studio', error);
    return NextResponse.json(
      { error: 'Failed to load external project studio' },
      { status: 500 }
    );
  }
}
