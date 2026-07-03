import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const UpdateWorkspaceLogoSchema = z.object({
  filePath: z.string().min(1),
});

const SAFE_LOGO_FILENAME_PATTERN = /^logo-\d+\.(png|jpg|jpeg|gif|webp|svg)$/;

function isSafePathSegment(segment: string) {
  if (!segment || segment === '.' || segment === '..') {
    return false;
  }

  try {
    const decodedSegment = decodeURIComponent(segment);

    if (
      decodedSegment === '.' ||
      decodedSegment === '..' ||
      decodedSegment.includes('/') ||
      decodedSegment.includes('\\')
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return !segment.includes('\\');
}

function isSafeWorkspaceLogoPath(filePath: string, workspaceId: string) {
  if (filePath !== filePath.trim() || !isSafePathSegment(workspaceId)) {
    return false;
  }

  const segments = filePath.split('/');

  if (segments.length !== 3) {
    return false;
  }

  const pathWorkspaceId = segments[0];
  const directory = segments[1];
  const filename = segments[2];

  if (!pathWorkspaceId || !directory || !filename) {
    return false;
  }

  return (
    pathWorkspaceId === workspaceId &&
    directory === 'logos' &&
    segments.every(isSafePathSegment) &&
    SAFE_LOGO_FILENAME_PATTERN.test(filename)
  );
}

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

      if (!isSafeWorkspaceLogoPath(workspaceData.logo_url, normalizedWsId)) {
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
      if (!isSafeWorkspaceLogoPath(body.data.filePath, normalizedWsId)) {
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

      if (
        workspaceData?.logo_url &&
        isSafeWorkspaceLogoPath(workspaceData.logo_url, normalizedWsId)
      ) {
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
