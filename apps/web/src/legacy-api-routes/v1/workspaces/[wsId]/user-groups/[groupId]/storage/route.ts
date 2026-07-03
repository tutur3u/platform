import { posix } from 'node:path';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireTeachWorkspaceAccess } from '@/lib/teach/api';
import { triggerWorkspaceStorageAutoExtract } from '@/lib/workspace-storage-auto-extract';
import {
  deleteWorkspaceStorageObjectByPath,
  listWorkspaceStorageDirectory,
  uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';
import { validateWorkspaceStorageUploadMetadata } from '@/lib/workspace-storage-upload-policy';

const routeParamsSchema = z.object({
  wsId: z.string().min(1),
  groupId: z.string().uuid(),
});

type UserGroupStoragePermission = 'update_user_groups' | 'view_user_groups';

function mapStorageError(error: unknown) {
  if (error instanceof WorkspaceStorageError) {
    return NextResponse.json(
      { message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { message: 'Internal server error' },
    { status: 500 }
  );
}

async function prepareUserGroupStorageRequest(
  rawParams:
    | { wsId: string; groupId: string }
    | Promise<{ wsId: string; groupId: string }>,
  context: SessionAuthContext,
  permission: UserGroupStoragePermission
): Promise<
  | {
      groupId: string;
      normalizedWsId: string;
    }
  | NextResponse
> {
  const parsedParams = routeParamsSchema.safeParse(await rawParams);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params', errors: parsedParams.error.issues },
      { status: 400 }
    );
  }

  const { wsId, groupId } = parsedParams.data;

  const access = await requireTeachWorkspaceAccess({
    context,
    permission,
    wsId,
  });
  if (access instanceof NextResponse) {
    return access;
  }

  const { data: group, error: groupError } = await access.sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', access.normalizedWsId)
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) {
    return NextResponse.json(
      { message: 'Failed to verify user group' },
      { status: 500 }
    );
  }

  if (!group) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }

  return { groupId, normalizedWsId: access.normalizedWsId };
}

export const GET = withSessionAuth<{
  groupId: string;
  wsId: string;
}>(
  async (_request, context, params) => {
    try {
      const prepared = await prepareUserGroupStorageRequest(
        params,
        context,
        'view_user_groups'
      );
      if (prepared instanceof NextResponse) {
        return prepared;
      }

      const result = await listWorkspaceStorageDirectory(
        prepared.normalizedWsId,
        {
          path: `user-groups/${prepared.groupId}`,
        }
      );

      return NextResponse.json({ data: result.data });
    } catch (error) {
      return mapStorageError(error);
    }
  },
  { allowAppSessionAuth: { targetApp: 'teach' } }
);

export const POST = withSessionAuth<{
  groupId: string;
  wsId: string;
}>(
  async (request, context, params) => {
    try {
      const prepared = await prepareUserGroupStorageRequest(
        params,
        context,
        'update_user_groups'
      );
      if (prepared instanceof NextResponse) {
        return prepared;
      }

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return NextResponse.json(
          { message: 'Invalid upload body' },
          { status: 400 }
        );
      }

      const file = formData.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ message: 'Missing file' }, { status: 400 });
      }

      let sanitizedFilename = sanitizeFilename(file.name);

      // If sanitization removed all characters, fall back to a safe generated name
      if (!sanitizedFilename) {
        const original = file.name || 'file';

        // Preserve a simple extension if present on the original filename
        const extMatch = String(original).match(/\.[a-zA-Z0-9]{1,8}$/);
        const ext = extMatch ? extMatch[0] : '';

        sanitizedFilename = `${generateRandomUUID()}${ext}`;
        // Helpful dev-time hint; avoid leaking in production logs
        if (process.env.NODE_ENV !== 'production') {
          serverLogger.warn('[storage] filename sanitized to fallback', {
            original,
            sanitizedFilename,
          });
        }
      }

      const uploadValidation = validateWorkspaceStorageUploadMetadata({
        contentType: file.type,
        filename: sanitizedFilename,
        size: file.size,
      });
      if (!uploadValidation.ok) {
        return NextResponse.json(
          { message: uploadValidation.message },
          { status: uploadValidation.status }
        );
      }

      if (formData.get('upsert') === 'true') {
        return NextResponse.json(
          { message: 'Upload overwrite is not allowed for this path' },
          { status: 403 }
        );
      }

      const filenameWithSuffix = `${generateRandomUUID()}-${sanitizedFilename}`;
      const storagePath = posix.join(
        'user-groups',
        prepared.groupId,
        filenameWithSuffix
      );

      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      const data = await uploadWorkspaceStorageFileDirect(
        prepared.normalizedWsId,
        storagePath,
        buffer,
        {
          contentType:
            uploadValidation.contentType || 'application/octet-stream',
          upsert: false,
        }
      );

      let autoExtract = null;
      let autoExtractError: string | null = null;

      try {
        autoExtract = await triggerWorkspaceStorageAutoExtract(
          prepared.normalizedWsId,
          {
            path: data.path,
            contentType:
              uploadValidation.contentType || 'application/octet-stream',
            originalFilename: sanitizedFilename,
            requestOrigin: new URL(request.url).origin,
          }
        );
      } catch (error) {
        autoExtractError =
          error instanceof Error
            ? error.message
            : 'Failed to trigger auto extraction';
      }

      return NextResponse.json({
        message: 'File uploaded successfully',
        autoExtract,
        autoExtractError,
        data: {
          path: data.path,
          fullPath: data.fullPath,
        },
      });
    } catch (error) {
      return mapStorageError(error);
    }
  },
  { allowAppSessionAuth: { targetApp: 'teach' } }
);

export const DELETE = withSessionAuth<{
  groupId: string;
  wsId: string;
}>(
  async (request, context, params) => {
    try {
      const prepared = await prepareUserGroupStorageRequest(
        params,
        context,
        'update_user_groups'
      );
      if (prepared instanceof NextResponse) {
        return prepared;
      }

      const url = new URL(request.url);
      const filename = url.searchParams.get('filename');

      if (!filename) {
        return NextResponse.json(
          { message: 'Filename required' },
          { status: 400 }
        );
      }

      const sanitizedFilename = sanitizeFilename(filename);
      if (!sanitizedFilename) {
        return NextResponse.json(
          { message: 'Invalid filename' },
          { status: 400 }
        );
      }

      await deleteWorkspaceStorageObjectByPath(
        prepared.normalizedWsId,
        `user-groups/${prepared.groupId}/${sanitizedFilename}`
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      return mapStorageError(error);
    }
  },
  { allowAppSessionAuth: { targetApp: 'teach' } }
);
