import {
  createAdminClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const getImageUrlsSchema = z.object({
  imagePaths: z.array(z.string().min(1)).min(1).max(5),
});

interface RouteParams {
  wsId: string;
  id: string;
}

const SIGNED_URL_EXPIRY_SECONDS = 3600;

export const POST = withSessionAuth(
  async (
    req,
    { user, supabase },
    params: RouteParams | Promise<RouteParams>
  ) => {
    const { wsId, id } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    const { data: requestRecord, error: requestError } = await sbAdmin
      .from('time_tracking_requests')
      .select('id, workspace_id, user_id')
      .eq('id', id)
      .eq('workspace_id', normalizedWsId)
      .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        { error: 'Failed to verify request access' },
        { status: 500 }
      );
    }

    if (!requestRecord) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (requestRecord.user_id !== user.id) {
      const permissions = await getPermissions({
        wsId: normalizedWsId,
        request: req,
      });

      if (!permissions) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      if (permissions.withoutPermission('manage_time_tracking_requests')) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }
    }

    try {
      const body = await req.json();
      const { imagePaths } = getImageUrlsSchema.parse(body);

      for (const imagePath of imagePaths) {
        if (!imagePath.startsWith(`${id}/`) || imagePath.includes('..')) {
          return NextResponse.json(
            { error: 'Invalid image path list' },
            { status: 400 }
          );
        }
      }

      const storageClient = await createDynamicAdminClient();

      const { data, error } = await storageClient.storage
        .from('time_tracking_requests')
        .createSignedUrls(imagePaths, SIGNED_URL_EXPIRY_SECONDS);

      if (error) {
        console.error('Error generating signed URLs:', error);
        return NextResponse.json(
          { error: 'Failed to generate signed image URLs' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        urls: imagePaths.map((path, index) => ({
          path,
          signedUrl: data?.[index]?.signedUrl ?? null,
        })),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.issues },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { rateLimitKind: 'read' }
);
