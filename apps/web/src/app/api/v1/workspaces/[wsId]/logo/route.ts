import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const UpdateWorkspaceLogoSchema = z.object({
  filePath: z.string().min(1),
});

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, { supabase }, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, request });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      const normalizedWsId = await normalizeWorkspaceId(wsId);
      const { data: workspaceData, error } = await supabase
        .from('workspaces')
        .select('logo_url')
        .eq('id', normalizedWsId)
        .single();

      if (error) {
        throw error;
      }

      if (!workspaceData?.logo_url) {
        return NextResponse.json({ url: null });
      }

      const sbAdmin = await createAdminClient();
      const { data, error: signedUrlError } = await sbAdmin.storage
        .from('workspaces')
        .createSignedUrl(workspaceData.logo_url, 60 * 15);

      if (signedUrlError) {
        throw signedUrlError;
      }

      return NextResponse.json({ url: data?.signedUrl || null });
    } catch (error) {
      console.error('Error loading workspace logo:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 30, swr: 30 } }
);

export const PATCH = withSessionAuth<{ wsId: string }>(
  async (request, { supabase }, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, request });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      if (permissions.withoutPermission('manage_workspace_settings')) {
        return NextResponse.json(
          { message: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      const body = UpdateWorkspaceLogoSchema.safeParse(await request.json());

      if (!body.success) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: body.error.issues },
          { status: 400 }
        );
      }

      const normalizedWsId = await normalizeWorkspaceId(wsId);
      if (!body.data.filePath.startsWith(`${normalizedWsId}/`)) {
        return NextResponse.json(
          { message: 'Invalid file path' },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from('workspaces')
        .update({ logo_url: body.data.filePath })
        .eq('id', normalizedWsId);

      if (error) {
        throw error;
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error updating workspace logo:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withSessionAuth<{ wsId: string }>(
  async (request, { supabase }, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, request });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      if (permissions.withoutPermission('manage_workspace_settings')) {
        return NextResponse.json(
          { message: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      const normalizedWsId = await normalizeWorkspaceId(wsId);
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('logo_url')
        .eq('id', normalizedWsId)
        .single();

      if (workspaceError) {
        throw workspaceError;
      }

      const { error: updateError } = await supabase
        .from('workspaces')
        .update({ logo_url: null })
        .eq('id', normalizedWsId);

      if (updateError) {
        throw updateError;
      }

      if (workspaceData?.logo_url) {
        try {
          const sbAdmin = await createAdminClient();
          await sbAdmin.storage
            .from('workspaces')
            .remove([workspaceData.logo_url]);
        } catch (storageError) {
          console.warn('Failed to delete workspace logo file:', storageError);
        }
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error deleting workspace logo:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
