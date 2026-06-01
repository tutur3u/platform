import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';
import { requireCmsRootExternalProjectsAdmin } from '@/lib/external-projects/admin-access';
import { updateWorkspaceExternalProjectBinding } from '@/lib/external-projects/admin-store';
import { adminRouteErrorResponse, readJsonBody } from '../../_shared';

const bindingSchema = z.object({
  canonicalId: z.string().min(1).max(120).nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const access = await requireCmsRootExternalProjectsAdmin();
  if (!access.ok) return access.response;

  try {
    const { workspaceId } = await params;
    const binding = await resolveWorkspaceExternalProjectBinding(
      workspaceId,
      access.admin
    );
    return NextResponse.json(binding);
  } catch (error) {
    return adminRouteErrorResponse(error, 'Failed to load site connection');
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const access = await requireCmsRootExternalProjectsAdmin();
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  try {
    const { workspaceId } = await params;
    const payload = bindingSchema.parse(body.body);
    const binding = await updateWorkspaceExternalProjectBinding({
      actorId: access.user.id,
      canonicalId: payload.canonicalId,
      db: access.admin,
      workspaceId,
    });

    return NextResponse.json(binding);
  } catch (error) {
    return adminRouteErrorResponse(error, 'Failed to update site connection');
  }
}
