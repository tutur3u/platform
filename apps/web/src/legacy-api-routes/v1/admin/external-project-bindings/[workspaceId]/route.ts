import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireRootExternalProjectsAdmin,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';

const bindingSchema = z.object({
  canonicalId: z.string().min(1).max(120).nullable(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const access = await requireRootExternalProjectsAdmin(request);
  if (!access.ok) return access.response;

  try {
    const { workspaceId } = await params;
    const binding = await resolveWorkspaceExternalProjectBinding(
      workspaceId,
      access.admin
    );
    return NextResponse.json(binding);
  } catch (error) {
    console.error(
      'Failed to resolve workspace external project binding',
      error
    );
    return NextResponse.json(
      { error: 'Failed to resolve workspace external project binding' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const access = await requireRootExternalProjectsAdmin(request);
  if (!access.ok) return access.response;

  try {
    const { workspaceId } = await params;
    const body = await request.json();
    const payload = bindingSchema.parse(body);

    const { error } = await access.supabase.rpc(
      'set_workspace_external_project_binding',
      {
        p_destination_ws_id: workspaceId,
        p_next_canonical_id: payload.canonicalId ?? undefined,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    const binding = await resolveWorkspaceExternalProjectBinding(
      workspaceId,
      access.admin
    );

    return NextResponse.json(binding);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to update workspace external project binding', error);
    return NextResponse.json(
      { error: 'Failed to update workspace external project binding' },
      { status: 500 }
    );
  }
}
