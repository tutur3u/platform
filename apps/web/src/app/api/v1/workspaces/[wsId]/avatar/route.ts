import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const UpdateWorkspaceAvatarSchema = z.object({
  filePath: z.string().min(1),
});

function extractAvatarPath(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return null;

  try {
    const url = new URL(avatarUrl);
    const pathParts = url.pathname.split('/avatars/');
    return pathParts[1] || null;
  } catch {
    return null;
  }
}

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

      const body = UpdateWorkspaceAvatarSchema.safeParse(await request.json());

      if (!body.success) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: body.error.issues },
          { status: 400 }
        );
      }

      const normalizedWsId = await normalizeWorkspaceId(wsId);
      if (!body.data.filePath.startsWith(`workspaces/${normalizedWsId}/`)) {
        return NextResponse.json(
          { message: 'Invalid file path' },
          { status: 400 }
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(body.data.filePath);

      const { error } = await supabase
        .from('workspaces')
        .update({ avatar_url: publicUrlData.publicUrl })
        .eq('id', normalizedWsId);

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        avatarUrl: publicUrlData.publicUrl,
      });
    } catch (error) {
      console.error('Error updating workspace avatar:', error);
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
        .select('avatar_url')
        .eq('id', normalizedWsId)
        .single();

      if (workspaceError) {
        throw workspaceError;
      }

      const { error: updateError } = await supabase
        .from('workspaces')
        .update({ avatar_url: null })
        .eq('id', normalizedWsId);

      if (updateError) {
        throw updateError;
      }

      const existingPath = extractAvatarPath(workspaceData?.avatar_url);
      if (existingPath) {
        try {
          const sbAdmin = await createAdminClient();
          await sbAdmin.storage.from('avatars').remove([existingPath]);
        } catch (storageError) {
          console.warn('Failed to delete workspace avatar file:', storageError);
        }
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error deleting workspace avatar:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
