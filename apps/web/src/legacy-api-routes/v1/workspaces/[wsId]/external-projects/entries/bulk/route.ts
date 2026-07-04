import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { bulkUpdateWorkspaceExternalProjectEntries } from '@/lib/external-projects/store';

const bulkEntrySchema = z.object({
  action: z.enum([
    'archive',
    'publish',
    'restore-draft',
    'schedule',
    'set-status',
    'unpublish',
  ]),
  entryIds: z.array(z.string().uuid()).min(1).max(100),
  scheduledFor: z.string().datetime().nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;

  try {
    const body = bulkEntrySchema.parse(await request.json());
    const access = await requireWorkspaceExternalProjectAccess({
      mode:
        body.action === 'publish' || body.action === 'unpublish'
          ? 'publish'
          : 'manage',
      request,
      wsId,
    });
    if (!access.ok) return access.response;

    const entries = await bulkUpdateWorkspaceExternalProjectEntries(
      {
        actorId: access.user.id,
        binding: access.binding,
        payload: {
          action: body.action,
          entryIds: body.entryIds,
          scheduledFor: body.scheduledFor,
          status: body.status,
        },
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(entries);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error(
      'Failed to bulk update workspace external project entries',
      error
    );
    return NextResponse.json(
      { error: 'Failed to bulk update workspace external project entries' },
      { status: 500 }
    );
  }
}
