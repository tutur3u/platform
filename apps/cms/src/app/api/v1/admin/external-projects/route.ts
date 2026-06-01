import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCmsRootExternalProjectsAdmin } from '@/lib/external-projects/admin-access';
import {
  createCanonicalExternalProject,
  listCanonicalExternalProjects,
} from '@/lib/external-projects/admin-store';
import { EXTERNAL_PROJECT_ADAPTER_OPTIONS } from '@/lib/external-projects/constants';
import { adminRouteErrorResponse, readJsonBody } from '../_shared';

const canonicalProjectSchema = z.object({
  adapter: z.enum(EXTERNAL_PROJECT_ADAPTER_OPTIONS),
  allowed_collections: z.array(z.string()).default([]),
  allowed_features: z.array(z.string()).default([]),
  delivery_profile: z.record(z.string(), z.unknown()).default({}),
  display_name: z.string().min(1).max(120),
  id: z.string().min(1).max(120),
  is_active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET() {
  const access = await requireCmsRootExternalProjectsAdmin();
  if (!access.ok) return access.response;

  try {
    const projects = await listCanonicalExternalProjects(access.admin);
    return NextResponse.json(projects);
  } catch (error) {
    return adminRouteErrorResponse(error, 'Failed to list site templates');
  }
}

export async function POST(request: Request) {
  const access = await requireCmsRootExternalProjectsAdmin();
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const payload = canonicalProjectSchema.parse(body.body);
    const project = await createCanonicalExternalProject(
      {
        actorId: access.user.id,
        adapter: payload.adapter,
        allowed_collections: payload.allowed_collections,
        allowed_features: payload.allowed_features,
        delivery_profile: payload.delivery_profile as Json,
        display_name: payload.display_name,
        id: payload.id,
        is_active: payload.is_active,
        metadata: payload.metadata as Json,
      },
      access.admin
    );

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return adminRouteErrorResponse(error, 'Failed to create site template');
  }
}
