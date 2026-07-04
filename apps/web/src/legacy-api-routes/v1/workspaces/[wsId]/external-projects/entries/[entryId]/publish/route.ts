import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { publishWorkspaceExternalProjectEntry } from '@/lib/external-projects/store';

const publishSchema = z.object({
  eventKind: z.enum(['publish', 'preview', 'unpublish']).default('publish'),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entryId: string; wsId: string }> }
) {
  const { entryId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'publish',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const { eventKind } = publishSchema.parse(body);
    const entry = await publishWorkspaceExternalProjectEntry(
      {
        actorId: access.user.id,
        binding: access.binding,
        entryId,
        eventKind,
        visibilityScope: eventKind === 'preview' ? 'preview' : 'public',
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to publish workspace external project entry', error);
    return NextResponse.json(
      { error: 'Failed to publish workspace external project entry' },
      { status: 500 }
    );
  }
}
