import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRootExternalProjectsAdmin } from '@/lib/external-projects/access';
import {
  createCanonicalExternalProject,
  listCanonicalExternalProjects,
} from '@/lib/external-projects/store';

const canonicalProjectSchema = z.object({
  adapter: z.enum(['junly', 'yoola', 'theguyser', 'exocorpse']),
  allowed_collections: z.array(z.string()).default([]),
  allowed_features: z.array(z.string()).default([]),
  delivery_profile: z.record(z.string(), z.unknown()).default({}),
  display_name: z.string().min(1).max(120),
  id: z.string().min(1).max(120),
  is_active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: Request) {
  const access = await requireRootExternalProjectsAdmin(request);
  if (!access.ok) return access.response;

  try {
    const projects = await listCanonicalExternalProjects(access.admin);
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Failed to list canonical external projects', error);
    return NextResponse.json(
      { error: 'Failed to list canonical external projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const access = await requireRootExternalProjectsAdmin(request);
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const payload = canonicalProjectSchema.parse(body);
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to create canonical external project', error);
    return NextResponse.json(
      { error: 'Failed to create canonical external project' },
      { status: 500 }
    );
  }
}
