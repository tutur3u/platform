import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCmsRootExternalProjectsAdmin } from '@/lib/external-projects/admin-access';
import { updateCanonicalExternalProject } from '@/lib/external-projects/admin-store';
import { EXTERNAL_PROJECT_ADAPTER_OPTIONS } from '@/lib/external-projects/constants';
import { adminRouteErrorResponse, readJsonBody } from '../../_shared';

const updateCanonicalProjectSchema = z.object({
  adapter: z.enum(EXTERNAL_PROJECT_ADAPTER_OPTIONS).optional(),
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
  const access = await requireCmsRootExternalProjectsAdmin();
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const { canonicalId } = await params;
    const payload = updateCanonicalProjectSchema.parse(body.body);
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
    return adminRouteErrorResponse(error, 'Failed to update site template');
  }
}
