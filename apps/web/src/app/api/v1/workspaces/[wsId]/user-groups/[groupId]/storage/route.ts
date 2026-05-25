import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { requireTeachWorkspaceAccess } from '@/lib/teach/api';
import {
  createWorkspaceStorageUploadPayload,
  deleteWorkspaceStorageObjectByPath,
  listWorkspaceStorageDirectory,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

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

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  upsert: z.boolean().optional(),
  size: z.number().int().min(0).optional(),
});

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

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return NextResponse.json(
          { message: 'Invalid request body' },
          { status: 400 }
        );
      }

      const parsed = uploadUrlSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsed.error.issues },
          { status: 400 }
        );
      }

      const sanitizedFilename = sanitizeFilename(parsed.data.filename);
      if (!sanitizedFilename) {
        return NextResponse.json(
          { message: 'Invalid filename' },
          { status: 400 }
        );
      }

      const filenameWithSuffix =
        parsed.data.upsert === true
          ? sanitizedFilename
          : `${generateRandomUUID()}-${sanitizedFilename}`;

      const uploadPayload = await createWorkspaceStorageUploadPayload(
        prepared.normalizedWsId,
        filenameWithSuffix,
        {
          path: `user-groups/${prepared.groupId}`,
          upsert: parsed.data.upsert ?? false,
          size: parsed.data.size,
        }
      );

      return NextResponse.json({
        signedUrl: uploadPayload.signedUrl,
        token: uploadPayload.token,
        headers: uploadPayload.headers,
        path: uploadPayload.path,
        fullPath: uploadPayload.fullPath,
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
