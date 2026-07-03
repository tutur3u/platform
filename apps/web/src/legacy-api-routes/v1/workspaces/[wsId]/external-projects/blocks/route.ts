import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { createWorkspaceExternalProjectBlock } from '@/lib/external-projects/store';

const blockSchema = z.object({
  block_type: z.string().min(1).max(120),
  content: z.record(z.string(), z.unknown()).default({}),
  entry_id: z.string().uuid(),
  sort_order: z.number().int().min(0).optional(),
  title: z.string().max(160).nullable().optional(),
});

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
    const payload = blockSchema.parse(await request.json());
    const block = await createWorkspaceExternalProjectBlock(
      {
        actorId: access.user.id,
        block_type: payload.block_type,
        content: payload.content as Json,
        entry_id: payload.entry_id,
        sort_order: payload.sort_order,
        title: payload.title,
        workspaceId: access.normalizedWorkspaceId,
      },
      access.admin
    );

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to create workspace external project block', error);
    return NextResponse.json(
      { error: 'Failed to create workspace external project block' },
      { status: 500 }
    );
  }
}
