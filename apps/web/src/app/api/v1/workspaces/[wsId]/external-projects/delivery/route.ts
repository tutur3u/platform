import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import { buildWorkspaceExternalProjectDeliveryPayload } from '@/lib/external-projects/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const url = new URL(request.url);
  const preview = url.searchParams.get('preview') === 'true';

  try {
    if (preview) {
      const access = await requireWorkspaceExternalProjectAccess({
        mode: 'publish',
        request,
        wsId,
      });
      if (!access.ok) return access.response;

      const payload = await buildWorkspaceExternalProjectDeliveryPayload(
        {
          binding: access.binding,
          includeDrafts: true,
          workspaceId: access.normalizedWorkspaceId,
        },
        access.admin
      );

      return NextResponse.json(payload);
    }

    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const binding = await resolveWorkspaceExternalProjectBinding(wsId, admin);

    if (!binding.enabled || !binding.canonical_project) {
      return NextResponse.json(
        { error: 'External project delivery unavailable for this workspace' },
        { status: 404 }
      );
    }

    const payload = await buildWorkspaceExternalProjectDeliveryPayload(
      {
        binding,
        includeDrafts: false,
        workspaceId: wsId,
      },
      admin
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to build external project delivery payload', error);
    return NextResponse.json(
      { error: 'Failed to build external project delivery payload' },
      { status: 500 }
    );
  }
}
