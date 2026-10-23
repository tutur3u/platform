import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  isWorkspaceAvatarPath,
  ownedWorkspaceAvatarPath,
} from '@tuturuuu/utils/workspace-avatar';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const UpdateWorkspaceAvatarSchema = z.object({
  filePath: z.string().min(1),
});

export const PATCH = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, user, request });

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

      const normalizedWsId = permissions.wsId;
      if (!isWorkspaceAvatarPath(body.data.filePath, normalizedWsId)) {
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
  async (request, { user, supabase }, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, user, request });

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

      const normalizedWsId = permissions.wsId;
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('avatar_url')
        .eq('id', normalizedWsId)
        .single();

      if (workspaceError) {
        throw workspaceError;
      }

      const { data: clearedWorkspace, error: updateError } = await supabase
        .from('workspaces')
        .update({ avatar_url: null })
        .eq('id', normalizedWsId)
        .select('id')
        .single();

      if (updateError || !clearedWorkspace) {
        throw updateError ?? new Error('Workspace avatar was not cleared');
      }

      const existingPath = ownedWorkspaceAvatarPath(
        workspaceData?.avatar_url,
        normalizedWsId,
        [process.env.SUPABASE_SERVER_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
      );
      if (existingPath) {
        try {
          const admin = await createAdminClient({ noCookie: true });
          const { error: storageError } = await admin.storage
            .from('avatars')
            .remove([existingPath]);
          if (storageError)
            console.warn(
              'Failed to delete workspace avatar file:',
              storageError
            );
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
