import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRootExternalProjectsAdmin } from '@/lib/external-projects/access';
import { updateCanonicalExternalProject } from '@/lib/external-projects/store';

const updateCanonicalProjectSchema = z.object({
  adapter: z.enum(['junly', 'yoola', 'theguyser', 'exocorpse']).optional(),
  allowed_collections: z.array(z.string()).optional(),
  allowed_features: z.array(z.string()).optional(),
  delivery_profile: z.record(z.string(), z.unknown()).optional(),
  display_name: z.string().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canonicalId: string }> }
) {
  const access = await requireRootExternalProjectsAdmin(request);
  if (!access.ok) return access.response;

  try {
    const { canonicalId } = await params;
    const body = await request.json();
    const payload = updateCanonicalProjectSchema.parse(body);
    const project = await updateCanonicalExternalProject(
      canonicalId,
      {
        actorId: access.user.id,
        adapter: payload.adapter,
        allowed_collections: payload.allowed_collections,
        allowed_features: payload.allowed_features,
        delivery_profile: payload.delivery_profile as Json | undefined,
        display_name: payload.display_name,
        is_active: payload.is_active,
        metadata: payload.metadata as Json | undefined,
      },
      access.admin
    );

    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to update canonical external project', error);
    return NextResponse.json(
      { error: 'Failed to update canonical external project' },
      { status: 500 }
    );
  }
}
