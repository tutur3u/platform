import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const DeleteBackgroundSchema = z.object({
  path: z.string().min(1),
});

interface RouteParams {
  wsId: string;
}

export const DELETE = withSessionAuth(
  async (
    req,
    { user, supabase },
    params: RouteParams | Promise<RouteParams>
  ) => {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    try {
      const body = await req.json();
      const { path } = DeleteBackgroundSchema.parse(body);

      if (!path.startsWith(`${normalizedWsId}/template-backgrounds/`)) {
        return NextResponse.json(
          { error: 'Invalid background path' },
          { status: 400 }
        );
      }

      const adminClient = await createDynamicAdminClient();
      const { error } = await adminClient.storage
        .from('workspaces')
        .remove([path]);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to delete background image' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.issues },
          { status: 400 }
        );
      }

      console.error('Unexpected error deleting template background:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { rateLimit: { windowMs: 60000, maxRequests: 30 } }
);
