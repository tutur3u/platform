import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
import { updateWorkspaceExternalProjectBlock } from '@/lib/external-projects/store';

const updateBlockSchema = z.object({
  block_type: z.string().min(1).max(120).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  sort_order: z.number().int().min(0).optional(),
  title: z.string().max(160).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ blockId: string; wsId: string }> }
) {
  const { blockId, wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'manage',
    request,
    wsId,
  });
  if (!access.ok) return access.response;

  try {
    const payload = updateBlockSchema.parse(await request.json());
    const block = await updateWorkspaceExternalProjectBlock(
      blockId,
      {
        actorId: access.user.id,
        block_type: payload.block_type,
        content: payload.content as Json | undefined,
        sort_order: payload.sort_order,
        title: payload.title,
      },
      access.admin
    );

    return NextResponse.json(block);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to update workspace external project block', error);
    return NextResponse.json(
      { error: 'Failed to update workspace external project block' },
      { status: 500 }
    );
  }
}
